import { Segment, SegmentResponse, Playback } from "./types";
import { BandwidthApproximator } from "./bandwidth-approximator";
import * as StreamUtils from "./utils/stream";
import * as Utils from "./utils/utils";
import * as LoggerUtils from "./utils/logger";
import debug from "debug";

export type EngineCallbacks = {
  onSuccess: (response: SegmentResponse) => void;
  onError: (reason: CoreRequestError) => void;
};

export type LoadProgress = {
  startTimestamp: number;
  lastLoadedChunkTimestamp?: number;
  startFromByte?: number;
  loadedBytes: number;
};

type HttpRequestAttempt = {
  type: "http";
  error?: RequestError;
};

type P2PRequestAttempt = {
  type: "p2p";
  peerId: string;
  error?: RequestError;
};

export type RequestAttempt = HttpRequestAttempt | P2PRequestAttempt;

export type RequestControls = Readonly<{
  firstBytesReceived: Request["firstBytesReceived"];
  addLoadedChunk: Request["addLoadedChunk"];
  completeOnSuccess: Request["completeOnSuccess"];
  abortOnError: Request["abortOnError"];
}>;

type OmitEncapsulated<T extends RequestAttempt> = Omit<T, "error">;
type StartRequestParameters =
  | OmitEncapsulated<HttpRequestAttempt>
  | OmitEncapsulated<P2PRequestAttempt>;

export type RequestStatus =
  | "not-started"
  | "loading"
  | "succeed"
  | "failed"
  | "aborted";

export class Request {
  readonly id: string;
  private _engineCallbacks?: EngineCallbacks;
  private currentAttempt?: RequestAttempt;
  private _failedAttempts: RequestAttempt[] = [];
  private finalData?: ArrayBuffer;
  private bytes: Uint8Array[] = [];
  private _loadedBytes = 0;
  private _totalBytes?: number;
  private _status: RequestStatus = "not-started";
  private progress?: LoadProgress;
  private notReceivingBytesTimeout: Timeout;
  private _abortRequestCallback?: (errorType: RequestInnerErrorType) => void;
  private readonly _logger: debug.Debugger;

  constructor(
    readonly segment: Segment,
    private readonly requestProcessQueueCallback: () => void,
    private readonly bandwidthApproximator: BandwidthApproximator,
    private readonly playback: Playback,
    private readonly settings: StreamUtils.PlaybackTimeWindowsSettings
  ) {
    this.id = Request.getRequestItemId(segment);
    this.notReceivingBytesTimeout = new Timeout(this.abortOnTimeout);

    const { type } = this.segment.stream;
    this._logger = debug(`core:request-${type}`);
  }

  get status() {
    return this._status;
  }

  get isSegmentRequestedByEngine(): boolean {
    return !!this._engineCallbacks;
  }

  get type() {
    return this.currentAttempt?.type;
  }

  get loadedBytes() {
    return this._loadedBytes;
  }

  get totalBytes(): number | undefined {
    return this._totalBytes;
  }

  get data(): ArrayBuffer | undefined {
    if (this.status !== "succeed") return;
    if (!this.finalData) this.finalData = Utils.joinChunks(this.bytes);
    return this.finalData;
  }

  get loadedPercent() {
    if (!this._totalBytes) return;
    return Utils.getPercent(this.loadedBytes, this._totalBytes);
  }

  get failedAttempts(): ReadonlyArray<Readonly<RequestAttempt>> {
    return this._failedAttempts;
  }

  setOrResolveEngineCallbacks(callbacks: EngineCallbacks) {
    if (this._engineCallbacks) {
      throw new Error("Segment is already requested by engine");
    }
    this._engineCallbacks = callbacks;
    if (this.finalData) this.resolveEngineCallbacksSuccessfully(this.finalData);
  }

  setTotalBytes(value: number) {
    if (this._totalBytes !== undefined) {
      throw new Error("Request total bytes value is already set");
    }
    this._totalBytes = value;
  }

  start(
    requestData: StartRequestParameters,
    controls: {
      notReceivingBytesTimeoutMs?: number;
      abort: (errorType: RequestInnerErrorType) => void;
    }
  ): RequestControls {
    if (this._status === "succeed") {
      throw new Error("Request has been already succeed.");
    }
    if (this._status === "loading") {
      throw new Error("Request has been already started.");
    }

    this._status = "loading";
    this.currentAttempt = { ...requestData };
    this.progress = {
      startFromByte: this._loadedBytes,
      loadedBytes: 0,
      startTimestamp: performance.now(),
    };
    this.bandwidthApproximator.addLoading(this.progress);
    const { notReceivingBytesTimeoutMs, abort } = controls;
    this._abortRequestCallback = abort;

    if (notReceivingBytesTimeoutMs !== undefined) {
      this.notReceivingBytesTimeout.start(notReceivingBytesTimeoutMs);
    }

    const statuses = StreamUtils.getSegmentPlaybackStatuses(
      this.segment,
      this.playback,
      this.settings
    );
    const statusString = LoggerUtils.getSegmentPlaybackStatusesString(statuses);
    this.logger(
      `${requestData.type} ${this.segment.externalId} ${statusString} started`
    );

    return {
      firstBytesReceived: this.firstBytesReceived,
      addLoadedChunk: this.addLoadedChunk,
      completeOnSuccess: this.completeOnSuccess,
      abortOnError: this.abortOnError,
    };
  }

  private resolveEngineCallbacksSuccessfully(data: ArrayBuffer) {
    this._engineCallbacks?.onSuccess({
      data,
      bandwidth: this.bandwidthApproximator.getBandwidth(),
    });
    this._engineCallbacks = undefined;
  }

  abortFromEngine() {
    this._engineCallbacks?.onError(new CoreRequestError("aborted"));
    this._engineCallbacks = undefined;
    this.requestProcessQueueCallback();
  }

  abortFromProcessQueue() {
    this.throwErrorIfNotLoadingStatus();
    this._status = "aborted";
    this._abortRequestCallback?.("abort");
    this._abortRequestCallback = undefined;
    this.currentAttempt = undefined;
    this.notReceivingBytesTimeout.clear();
  }

  private abortOnTimeout = () => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt) return;

    this._status = "failed";
    const error = new RequestError("bytes-receiving-timeout");
    this._abortRequestCallback?.(error.type);

    this.currentAttempt.error = error;
    this._failedAttempts.push(this.currentAttempt);
    this.notReceivingBytesTimeout.clear();
    this.requestProcessQueueCallback();
  };

  private abortOnError = (error: RequestError) => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt) return;

    this._status = "failed";
    this.currentAttempt.error = error;
    this._failedAttempts.push(this.currentAttempt);
    this.notReceivingBytesTimeout.clear();
    this.requestProcessQueueCallback();
  };

  private completeOnSuccess = () => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt) return;

    this.notReceivingBytesTimeout.clear();
    this.finalData = Utils.joinChunks(this.bytes);
    this._status = "succeed";
    this._totalBytes = this._loadedBytes;

    this.resolveEngineCallbacksSuccessfully(this.finalData);
    this.logger(
      `${this.currentAttempt.type} ${this.segment.externalId} succeed`
    );
    this.requestProcessQueueCallback();
  };

  private addLoadedChunk = (chunk: Uint8Array) => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt || !this.progress) return;
    this.notReceivingBytesTimeout.restart();

    this.bytes.push(chunk);
    this.progress.lastLoadedChunkTimestamp = performance.now();
    this.progress.loadedBytes += chunk.length;
    this._loadedBytes += chunk.length;
  };

  private firstBytesReceived = () => {
    this.throwErrorIfNotLoadingStatus();
    this.notReceivingBytesTimeout.restart();
  };

  private throwErrorIfNotLoadingStatus() {
    if (this._status !== "loading") {
      throw new Error(`Request has been already ${this.status}.`);
    }
  }

  private logger(message: string) {
    this._logger.color = this.currentAttempt?.type === "http" ? "green" : "red";
    this._logger(message);
    this._logger.color = "";
  }

  static getRequestItemId(segment: Segment) {
    return segment.localId;
  }
}

const requestInnerErrorTypes = ["abort", "bytes-receiving-timeout"] as const;

const httpRequestErrorTypes = ["fetch-error"] as const;

const peerRequestErrorTypes = [
  "peer-response-bytes-mismatch",
  "peer-segment-absent",
  "peer-closed",
] as const;

export type RequestInnerErrorType = (typeof requestInnerErrorTypes)[number];
export type HttpRequestErrorType = (typeof httpRequestErrorTypes)[number];
export type PeerRequestErrorType = (typeof peerRequestErrorTypes)[number];

type RequestErrorType =
  | RequestInnerErrorType
  | PeerRequestErrorType
  | HttpRequestErrorType;

export class RequestError<
  T extends RequestErrorType = RequestErrorType
> extends Error {
  constructor(readonly type: T, message?: string) {
    super(message);
  }

  static isRequestInnerErrorType(
    error: RequestError
  ): error is RequestError<RequestInnerErrorType> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return requestInnerErrorTypes.includes(error.type as any);
  }
}

export class CoreRequestError extends Error {
  constructor(readonly type: "failed" | "aborted") {
    super();
  }
}

export class Timeout {
  private timeoutId?: number;
  private ms?: number;

  constructor(private readonly action: () => void) {}

  start(ms: number) {
    if (this.timeoutId) {
      throw new Error("Timeout is already started.");
    }
    this.ms = ms;
    this.timeoutId = window.setTimeout(this.action, this.ms);
  }

  restart(ms?: number) {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    if (ms) this.ms = ms;
    if (!this.ms) return;
    this.timeoutId = window.setTimeout(this.action, this.ms);
  }

  clear() {
    clearTimeout(this.timeoutId);
    this.timeoutId = undefined;
  }
}
