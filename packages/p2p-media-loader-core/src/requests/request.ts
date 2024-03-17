import debug from "debug";
import { BandwidthCalculators, Playback } from "../internal-types";
import {
  CoreEventMap,
  RequestError,
  RequestInnerErrorType,
  Segment,
} from "../types";

import * as LoggerUtils from "../utils/logger";
import * as StreamUtils from "../utils/stream";
import * as Utils from "../utils/utils";
import { EventTarget } from "../utils/event-target";

export type LoadProgress = {
  startTimestamp: number;
  lastLoadedChunkTimestamp?: number;
  startFromByte?: number;
  loadedBytes: number;
};

type HttpRequestAttempt = {
  downloadSource: "http";
  error?: RequestError;
};

type P2PRequestAttempt = {
  downloadSource: "p2p";
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
    error: RequestError<RequestInnerErrorType>,
  ) => void;
  private readonly _logger: debug.Debugger;
  private _isHandledByProcessQueue = false;
  private readonly onSegmentError: CoreEventMap["onSegmentError"];
  private readonly onSegmentAbort: CoreEventMap["onSegmentAbort"];
  private readonly onSegmentStart: CoreEventMap["onSegmentStart"];
  private readonly onSegmentLoaded: CoreEventMap["onSegmentLoaded"];

  constructor(
    readonly segment: Segment,
    private readonly requestProcessQueueCallback: () => void,
    private readonly bandwidthCalculators: BandwidthCalculators,
    private readonly playback: Playback,
    private readonly playbackConfig: StreamUtils.PlaybackTimeWindowsConfig,
    eventTarget: EventTarget<CoreEventMap>,
  ) {
    this.onSegmentError = eventTarget.getEventDispatcher("onSegmentError");
    this.onSegmentAbort = eventTarget.getEventDispatcher("onSegmentAbort");
    this.onSegmentStart = eventTarget.getEventDispatcher("onSegmentStart");
    this.onSegmentLoaded = eventTarget.getEventDispatcher("onSegmentLoaded");

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

  get downloadSource() {
    return this.currentAttempt?.downloadSource;
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
    },
  ): RequestControls {
    if (this._status === "succeed") {
      throw new Error(
        `Request ${this.segment.externalId} has been already succeed.`,
      );
    }
    if (this._status === "loading") {
      throw new Error(
        `Request ${this.segment.externalId} has been already started.`,
      );
    }

    this.setStatus("loading");
    this.currentAttempt = { ...requestData };
    this.progress = {
      startFromByte: this._loadedBytes,
      loadedBytes: 0,
      startTimestamp: performance.now(),
    };
    this.manageBandwidthCalculatorsState("start");

    const { notReceivingBytesTimeoutMs, abort } = controls;
    this._abortRequestCallback = abort;

    if (notReceivingBytesTimeoutMs !== undefined) {
      this.notReceivingBytesTimeout.start(notReceivingBytesTimeoutMs);
    }

    const statuses = StreamUtils.getSegmentPlaybackStatuses(
      this.segment,
      this.playback,
      this.playbackConfig,
    );
    const statusString = LoggerUtils.getSegmentPlaybackStatusesString(statuses);
    this.logger(
      `${requestData.downloadSource} ${this.segment.externalId} ${statusString} started`,
    );

    this.onSegmentStart({
      segment: this.segment,
      downloadSource: requestData.downloadSource,
      peerId:
        requestData.downloadSource === "p2p" ? requestData.peerId : undefined,
    });

    return {
      firstBytesReceived: this.firstBytesReceived,
      addLoadedChunk: this.addLoadedChunk,
      completeOnSuccess: this.completeOnSuccess,
      abortOnError: this.abortOnError,
    };
  }

  abortFromProcessQueue() {
    this.throwErrorIfNotLoadingStatus();
    this.setStatus("aborted");
    this.logger(
      `${this.currentAttempt?.downloadSource} ${this.segment.externalId} aborted`,
    );
    this._abortRequestCallback?.(new RequestError("abort"));
    this.onSegmentAbort({
      segment: this.segment,
      downloadSource: this.currentAttempt?.downloadSource,
      peerId:
        this.currentAttempt?.downloadSource === "p2p"
          ? this.currentAttempt.peerId
          : undefined,
    });
    this._abortRequestCallback = undefined;
    this.manageBandwidthCalculatorsState("stop");
    this.notReceivingBytesTimeout.clear();
  }

  private abortOnTimeout = () => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt) return;

    this.setStatus("failed");
    const error = new RequestError("bytes-receiving-timeout");
    this._abortRequestCallback?.(error);
    this.logger(
      `${this.downloadSource} ${this.segment.externalId} failed ${error.type}`,
    );
    this._failedAttempts.add({
      ...this.currentAttempt,
      error,
    });
    this.onSegmentError({
      segment: this.segment,
      error,
      downloadSource: this.currentAttempt.downloadSource,
      peerId:
        this.currentAttempt.downloadSource === "p2p"
          ? this.currentAttempt.peerId
          : undefined,
    });
    this.notReceivingBytesTimeout.clear();
    this.manageBandwidthCalculatorsState("stop");
    this.requestProcessQueueCallback();
  };

  private abortOnError = (error: RequestError) => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt) return;

    this.setStatus("failed");
    this.logger(
      `${this.downloadSource} ${this.segment.externalId} failed ${error.type}`,
    );
    this._failedAttempts.add({
      ...this.currentAttempt,
      error,
    });
    this.onSegmentError({
      segment: this.segment,
      error,
      downloadSource: this.currentAttempt.downloadSource,
      peerId:
        this.currentAttempt.downloadSource === "p2p"
          ? this.currentAttempt.peerId
          : undefined,
    });
    this.notReceivingBytesTimeout.clear();
    this.manageBandwidthCalculatorsState("stop");
    this.requestProcessQueueCallback();
  };

  private completeOnSuccess = () => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt) return;

    this.manageBandwidthCalculatorsState("stop");
    this.notReceivingBytesTimeout.clear();
    this.finalData = Utils.joinChunks(this.bytes);
    this.setStatus("succeed");
    this._totalBytes = this._loadedBytes;
    this.onSegmentLoaded({
      bytesLength: this.finalData.byteLength,
      downloadSource: this.currentAttempt.downloadSource,
      peerId:
        this.currentAttempt.downloadSource === "p2p"
          ? this.currentAttempt.peerId
          : undefined,
    });

    this.logger(
      `${this.currentAttempt.downloadSource} ${this.segment.externalId} succeed`,
    );
    this.requestProcessQueueCallback();
  };

  private addLoadedChunk = (chunk: Uint8Array) => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt || !this.progress) return;
    this.notReceivingBytesTimeout.restart();

    const byteLength = chunk.byteLength;
    const { all: allBC, http: httpBC } = this.bandwidthCalculators;
    allBC.addBytes(byteLength);
    if (this.currentAttempt.downloadSource === "http") {
      httpBC.addBytes(byteLength);
    }

    this.bytes.push(chunk);
    this.progress.lastLoadedChunkTimestamp = performance.now();
    this.progress.loadedBytes += byteLength;
    this._loadedBytes += byteLength;
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
    this._logger.color =
      this.currentAttempt?.downloadSource === "http" ? "green" : "red";
    this._logger(message);
    this._logger.color = "";
  }

  private manageBandwidthCalculatorsState(state: "start" | "stop") {
    const { all, http } = this.bandwidthCalculators;
    const method = state === "start" ? "startLoading" : "stopLoading";
    if (this.currentAttempt?.downloadSource === "http") http[method]();
    all[method]();
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
      (sum, attempt) => (attempt.downloadSource === "http" ? sum + 1 : sum),
      0,
    );
  }

  get lastAttempt(): Readonly<Required<RequestAttempt>> | undefined {
    return this.attempts[this.attempts.length - 1];
  }

  clear() {
    this.attempts = [];
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
