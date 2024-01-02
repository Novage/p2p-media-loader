import { Segment, SegmentResponse, Playback } from "./types";
import { BandwidthCalculator } from "./bandwidth-calculator";
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

type OmitEncapsulated<T extends RequestAttempt> = Omit<
  T,
  "error" | "errorTimestamp"
>;
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
  private _failedAttempts = new FailedRequestAttempts();
  private finalData?: ArrayBuffer;
  private bytes: Uint8Array[] = [];
  private _loadedBytes = 0;
  private _totalBytes?: number;
  private _status: RequestStatus = "not-started";
  private progress?: LoadProgress;
  private notReceivingBytesTimeout: Timeout;
  private _abortRequestCallback?: (
    error: RequestError<RequestInnerErrorType>
  ) => void;
  private readonly _logger: debug.Debugger;
  private _isHandledByProcessQueue = false;

  constructor(
    readonly segment: Segment,
    private readonly requestProcessQueueCallback: () => void,
    private readonly bandwidthCalculator: BandwidthCalculator,
    private readonly playback: Playback,
    private readonly settings: StreamUtils.PlaybackTimeWindowsSettings
  ) {
    this.id = Request.getRequestItemId(this.segment);
    const { byteRange } = this.segment;
    if (byteRange) {
      const { end, start } = byteRange;
      this._totalBytes = end - start + 1;
    }
    this.notReceivingBytesTimeout = new Timeout(this.abortOnTimeout);

    const { type } = this.segment.stream;
    this._logger = debug(`core:request-${type}`);
  }

  clearLoadedBytes() {
    this._loadedBytes = 0;
    this.bytes = [];
    this._totalBytes = undefined;
  }

  get status() {
    return this._status;
  }

  private setStatus(status: RequestStatus) {
    this._status = status;
    this._isHandledByProcessQueue = false;
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

  get failedAttempts() {
    return this._failedAttempts;
  }

  get isHandledByProcessQueue() {
    return this._isHandledByProcessQueue;
  }

  markHandledByProcessQueue() {
    this._isHandledByProcessQueue = true;
  }

  setEngineCallbacks(callbacks: EngineCallbacks) {
    if (this._engineCallbacks) {
      throw new Error("Segment is already requested by engine");
    }
    this.failedAttempts.clear();
    this._isHandledByProcessQueue = false;
    this._engineCallbacks = callbacks;
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
      abort: (errorType: RequestError<RequestInnerErrorType>) => void;
    }
  ): RequestControls {
    if (this._status === "succeed") {
      throw new Error(
        `Request ${this.segment.externalId} has been already succeed.`
      );
    }
    if (this._status === "loading") {
      throw new Error(
        `Request ${this.segment.externalId} has been already started.`
      );
    }

    this.setStatus("loading");
    this.currentAttempt = { ...requestData };
    this.progress = {
      startFromByte: this._loadedBytes,
      loadedBytes: 0,
      startTimestamp: performance.now(),
    };
    this.bandwidthCalculator.startLoading();
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

  resolveEngineCallbacksSuccessfully() {
    if (!this.finalData) return;
    const bandwidth = this.bandwidthCalculator.getBandwidthForLastNSeconds(3);
    this._engineCallbacks?.onSuccess({ data: this.finalData, bandwidth });
    this._engineCallbacks = undefined;
  }

  resolveEngineCallbacksWithError() {
    this._engineCallbacks?.onError(new CoreRequestError("failed"));
    this._engineCallbacks = undefined;
  }

  abortFromEngine() {
    if (this._status !== "loading") return;
    this._engineCallbacks?.onError(new CoreRequestError("aborted"));
    this._engineCallbacks = undefined;
    this.requestProcessQueueCallback();
  }

  abortFromProcessQueue() {
    this.throwErrorIfNotLoadingStatus();
    this.setStatus("aborted");
    this.logger(
      `${this.currentAttempt?.type} ${this.segment.externalId} aborted`
    );
    this._abortRequestCallback?.(new RequestError("abort"));
    this._abortRequestCallback = undefined;
    this.currentAttempt = undefined;
    this.notReceivingBytesTimeout.clear();
    this.bandwidthCalculator.stopLoading();
  }

  private abortOnTimeout = () => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt) return;

    this.setStatus("failed");
    const error = new RequestError("bytes-receiving-timeout");
    this._abortRequestCallback?.(error);
    this.logger(`${this.type} ${this.segment.externalId} failed ${error.type}`);

    this._failedAttempts.add({
      ...this.currentAttempt,
      error,
    });
    this.notReceivingBytesTimeout.clear();
    this.bandwidthCalculator.stopLoading();
    this.requestProcessQueueCallback();
  };

  private abortOnError = (error: RequestError) => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt) return;

    this.setStatus("failed");
    this.logger(`${this.type} ${this.segment.externalId} failed ${error.type}`);
    this._failedAttempts.add({
      ...this.currentAttempt,
      error,
    });
    this.notReceivingBytesTimeout.clear();
    this.bandwidthCalculator.stopLoading();
    this.requestProcessQueueCallback();
  };

  private completeOnSuccess = () => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt) return;

    this.bandwidthCalculator.stopLoading();
    this.notReceivingBytesTimeout.clear();
    this.finalData = Utils.joinChunks(this.bytes);
    this.setStatus("succeed");
    this._totalBytes = this._loadedBytes;

    this.logger(
      `${this.currentAttempt.type} ${this.segment.externalId} succeed`
    );
    this.requestProcessQueueCallback();
  };

  private addLoadedChunk = (chunk: Uint8Array) => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt || !this.progress) return;
    this.notReceivingBytesTimeout.restart();

    this.bandwidthCalculator.addBytes(chunk.length);
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

class FailedRequestAttempts {
  private attempts: Required<RequestAttempt>[] = [];

  add(attempt: Required<RequestAttempt>) {
    this.attempts.push(attempt);
  }

  get httpAttemptsCount() {
    return this.attempts.reduce(
      (sum, attempt) => (attempt.type === "http" ? sum + 1 : sum),
      0
    );
  }

  get lastAttempt(): Readonly<Required<RequestAttempt>> | undefined {
    return this.attempts[this.attempts.length - 1];
  }

  clear() {
    this.attempts = [];
  }
}

const requestInnerErrorTypes = ["abort", "bytes-receiving-timeout"] as const;

const httpRequestErrorTypes = [
  "http-error",
  "http-bytes-mismatch",
  "http-unexpected-status-code",
] as const;

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
  T extends RequestErrorType = RequestErrorType,
> extends Error {
  readonly timestamp: number;

  constructor(
    readonly type: T,
    message?: string
  ) {
    super(message);
    this.timestamp = performance.now();
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
