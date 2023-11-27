import { EventDispatcher } from "./event-dispatcher";
import { Segment, SegmentResponse } from "./types";
import { BandwidthApproximator } from "./bandwidth-approximator";
import * as Utils from "./utils/utils";

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

export type RequestEvents = {
  onSuccess: (request: Request, data: ArrayBuffer) => void;
  onError: (request: Request, data: RequestError) => void;
};

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

type RequestStatus =
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
  private bytes: Uint8Array[] = [];
  private _loadedBytes = 0;
  private _totalBytes?: number;
  private _status: RequestStatus = "not-started";
  private progress?: LoadProgress;
  private notReceivingBytesTimeout: Timeout;
  private _abortRequestCallback?: (errorType: RequestInnerErrorType) => void;

  constructor(
    readonly segment: Segment,
    private readonly bandwidthApproximator: BandwidthApproximator
  ) {
    this.id = Request.getRequestItemId(segment);
    this.notReceivingBytesTimeout = new Timeout(this.abortOnTimeout);
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

  get loadedPercent() {
    if (!this._totalBytes) return;
    return Utils.getPercent(this.loadedBytes, this._totalBytes);
  }

  get failedAttempts(): ReadonlyArray<Readonly<RequestAttempt>> {
    return this._failedAttempts;
  }

  setEngineCallbacks(callbacks: EngineCallbacks) {
    if (this._engineCallbacks) {
      throw new Error("Segment is already requested by engine");
    }
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

    return {
      firstBytesReceived: this.firstBytesReceived,
      addLoadedChunk: this.addLoadedChunk,
      completeOnSuccess: this.completeOnSuccess,
      abortOnError: this.abortOnError,
    };
  }

  abortFromEngine() {
    this._engineCallbacks?.onError(new CoreRequestError("aborted"));
    this._engineCallbacks = undefined;
  }

  abortFromProcessQueue() {
    this.throwErrorIfNotLoadingStatus();
    this._status = "aborted";
    this._abortRequestCallback?.("abort");
    this._abortRequestCallback = undefined;
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
  };

  private abortOnError = (error: RequestError) => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt) return;

    this._status = "failed";
    this.currentAttempt.error = error;
    this._failedAttempts.push(this.currentAttempt);
    this.notReceivingBytesTimeout.clear();
  };

  private completeOnSuccess = () => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt) return;

    this.notReceivingBytesTimeout.clear();
    const data = Utils.joinChunks(this.bytes);
    this._status = "succeed";
    this._totalBytes = this._loadedBytes;

    this._engineCallbacks?.onSuccess({
      data,
      bandwidth: this.bandwidthApproximator.getBandwidth(),
    });
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
