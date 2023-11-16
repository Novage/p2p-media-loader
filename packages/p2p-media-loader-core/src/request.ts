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
  cancelOnError: Request["cancelOnError"];
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

export class Request extends EventDispatcher<RequestEvents> {
  readonly id: string;
  private _engineCallbacks?: EngineCallbacks;
  private currentAttempt?: RequestAttempt;
  private prevAttempts: RequestAttempt[] = [];
  private chunks: Uint8Array[] = [];
  private _loadedBytes = 0;
  private _totalBytes?: number;
  private _status: RequestStatus = "not-started";
  private progress?: LoadProgress;
  private firstBytesTimeout: Timeout;
  private fullBytesTimeout: Timeout;
  private _abortRequestCallback?: (errorType: RequestInnerErrorType) => void;

  constructor(
    readonly segment: Segment,
    private readonly bandwidthApproximator: BandwidthApproximator
  ) {
    super();
    this.id = Request.getRequestItemId(segment);
    this.firstBytesTimeout = new Timeout(this.onFirstBytesTimeout);
    this.fullBytesTimeout = new Timeout(this.onFullBytesTimeout);
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

  set engineCallbacks(callbacks: EngineCallbacks) {
    if (this._engineCallbacks) {
      throw new Error("Segment is already requested by engine");
    }
    this._engineCallbacks = callbacks;
  }

  get totalBytes(): number | undefined {
    return this._totalBytes;
  }

  setTotalBytes(value: number) {
    if (this._totalBytes !== undefined) {
      throw new Error("Request total bytes value is already set");
    }
    this._totalBytes = value;
  }

  get loadedPercent() {
    if (!this._totalBytes) return;
    return Utils.getPercent(this.loadedBytes, this._totalBytes);
  }

  get requestAttempts(): ReadonlyArray<Readonly<RequestAttempt>> {
    return this.prevAttempts;
  }

  start(
    requestData: StartRequestParameters,
    controls: {
      firstBytesTimeoutMs?: number;
      fullLoadingTimeoutMs?: number;
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
    const attempt: RequestAttempt = {
      ...requestData,
    };
    this.progress = {
      startFromByte: this._loadedBytes,
      loadedBytes: 0,
      startTimestamp: performance.now(),
    };
    this.bandwidthApproximator.addLoading(this.progress);
    const { firstBytesTimeoutMs, fullLoadingTimeoutMs, abort } = controls;
    this._abortRequestCallback = abort;
    if (firstBytesTimeoutMs !== undefined) {
      this.firstBytesTimeout.start(firstBytesTimeoutMs);
    }
    if (fullLoadingTimeoutMs !== undefined) {
      this.fullBytesTimeout.start(fullLoadingTimeoutMs);
    }

    this.currentAttempt = attempt;
    return {
      firstBytesReceived: this.firstBytesReceived,
      addLoadedChunk: this.addLoadedChunk,
      completeOnSuccess: this.completeOnSuccess,
      cancelOnError: this.cancelOnError,
    };
  }

  abort() {
    this.throwErrorIfNotLoadingStatus();
    if (!this._abortRequestCallback) return;
    this._status = "aborted";
    this._abortRequestCallback("abort");
    this._abortRequestCallback = undefined;
  }

  abortEngineRequest() {
    this._engineCallbacks?.onError(new CoreRequestError("aborted"));
    this._engineCallbacks = undefined;
  }

  private completeOnSuccess = () => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt) return;

    this.fullBytesTimeout.stopAndClear();
    const data = Utils.joinChunks(this.chunks);
    this._status = "succeed";
    this.prevAttempts.push(this.currentAttempt);

    this._engineCallbacks?.onSuccess({
      data,
      bandwidth: this.bandwidthApproximator.getBandwidth(),
    });
    this.dispatch("onSuccess", this, data);
  };

  private addLoadedChunk = (chunk: Uint8Array) => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt || !this.progress) return;

    this.chunks.push(chunk);
    this.progress.lastLoadedChunkTimestamp = performance.now();
    this.progress.loadedBytes += chunk.length;
    this._loadedBytes += chunk.length;
  };

  private firstBytesReceived = () => {
    this.throwErrorIfNotLoadingStatus();
    this.firstBytesTimeout.stopAndClear();
  };

  private cancelOnError = (error: RequestError) => {
    this.throwErrorIfNotLoadingStatus();
    this.throwRequestError(error, false);
  };

  private throwRequestError(error: RequestError, abort = true) {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt) return;
    this._status = "failed";
    if (
      abort &&
      this._abortRequestCallback &&
      RequestError.isRequestInnerErrorType(error)
    ) {
      this._abortRequestCallback(error.type);
    }
    this.currentAttempt.error = error;
    this.prevAttempts.push(this.currentAttempt);
    this.dispatch("onError", this, error);
  }

  private onFirstBytesTimeout = () => {
    this.throwErrorIfNotLoadingStatus();
    this.throwRequestError(new RequestError("first-bytes-timeout"), true);
  };

  private onFullBytesTimeout = () => {
    this.throwErrorIfNotLoadingStatus();
    this.throwRequestError(new RequestError("full-bytes-timeout"), true);
  };

  private throwErrorIfNotLoadingStatus() {
    if (this._status !== "loading") {
      throw new Error("Request has been already completed/aborted/failed.");
    }
  }

  static getRequestItemId(segment: Segment) {
    return segment.localId;
  }
}

const requestInnerErrorTypes = [
  "abort",
  "first-bytes-timeout",
  "full-bytes-timeout",
] as const;

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

  constructor(private readonly action: () => void) {}

  start(ms: number) {
    if (this.timeoutId) {
      throw new Error("Timeout is already started.");
    }
    this.timeoutId = window.setTimeout(this.action, ms);
  }

  stopAndClear() {
    clearTimeout(this.timeoutId);
    this.timeoutId = undefined;
  }
}
