import { diagnostics, type DiagnosticsToken } from "../diagnostics.js";
import debug from "debug";
import { BandwidthCalculators, SegmentWithStream } from "../internal-types.js";
import type { BandwidthDownload } from "../bandwidth-calculator.js";
import {
  CoreEventMap,
  RequestError,
  RequestAbortErrorType,
  RequestErrorType,
  Segment,
} from "../types.js";
import * as Utils from "../utils/utils.js";
import { EventTarget } from "../utils/event-target.js";

export type LoadProgress = {
  startTimestamp: number;
  /** When the response's headers arrived; HTTP only. */
  responseTimestamp?: number;
  lastLoadedChunkTimestamp?: number;
  startFromByte?: number;
  loadedBytes: number;
};

/**
 * Why an attempt was started, where that changes how the core treats it:
 * `"peer-after-http-failure"` is a player's urgent request's one P2P attempt
 * after an HTTP attempt failed. An attempt with no tag is an ordinary one.
 */
export type AttemptTag = "peer-after-http-failure";

type HttpRequestAttempt = {
  downloadSource: "http";
  tag?: AttemptTag;
  error?: RequestError;
};

type P2PRequestAttempt = {
  downloadSource: "p2p";
  peerId: string;
  tag?: AttemptTag;
  error?: RequestError;
};

export type RequestAttempt = HttpRequestAttempt | P2PRequestAttempt;

/** An attempt that failed, with its error. */
type FailedAttempt = RequestAttempt & { error: RequestError };

export type RequestControls = Readonly<{
  addLoadedChunk: Request["addLoadedChunk"];
  startResponse: Request["startResponse"];
  completeOnSuccess: Request["completeOnSuccess"];
  failWithError: Request["failWithError"];
}>;

type OmitEncapsulated<T extends RequestAttempt> = Omit<
  T,
  "error" | "errorTimestamp" | "tag"
>;
type StartRequestParameters =
  OmitEncapsulated<HttpRequestAttempt> | OmitEncapsulated<P2PRequestAttempt>;

export type RequestStatus =
  "not-started" | "loading" | "succeed" | "failed" | "aborted";

function mapSegmentWithStreamToSegment(segment: SegmentWithStream): Segment {
  return {
    runtimeId: segment.runtimeId,
    externalId: segment.externalId,
    url: segment.url,
    byteRange: segment.byteRange && { ...segment.byteRange },
    startTime: segment.startTime,
    endTime: segment.endTime,
  };
}

export class Request {
  private currentAttempt?: RequestAttempt;
  private _failedAttempts = new FailedRequestAttempts();
  private finalData?: ArrayBuffer;
  private bytes: Uint8Array[] = [];
  private _loadedBytes = 0;
  private _totalBytes?: number;
  private _status: RequestStatus = "not-started";
  private progress?: LoadProgress;
  /** The attempt under way, as the shared bandwidth calculators measure it. */
  private bandwidthDownloads?: {
    all: BandwidthDownload;
    http?: BandwidthDownload;
  };
  private notReceivingBytesTimeout: Timeout;
  private _onAbortCallback?: (
    error: RequestError<RequestAbortErrorType>,
  ) => void;
  private notReceivingBytesTimeoutMs?: number;
  private firstByteTimeoutMs?: number;
  private readonly _logger: debug.Debugger;
  private _isHandledByProcessQueue = false;
  private readonly onSegmentError: CoreEventMap["onSegmentError"];
  private readonly onSegmentAbort: CoreEventMap["onSegmentAbort"];
  private readonly onSegmentStart: CoreEventMap["onSegmentStart"];
  private readonly onSegmentLoaded: CoreEventMap["onSegmentLoaded"];

  constructor(
    readonly segment: SegmentWithStream,
    private readonly requestProcessQueueCallback: () => void,
    private readonly bandwidthCalculators: BandwidthCalculators,
    eventTarget: EventTarget<CoreEventMap>,
    readonly infoHash: string,
  ) {
    this.onSegmentError = eventTarget.getEventDispatcher("onSegmentError");
    this.onSegmentAbort = eventTarget.getEventDispatcher("onSegmentAbort");
    this.onSegmentStart = eventTarget.getEventDispatcher("onSegmentStart");
    this.onSegmentLoaded = eventTarget.getEventDispatcher("onSegmentLoaded");

    const { byteRange } = this.segment;
    if (byteRange) {
      const { end, start } = byteRange;
      this._totalBytes = end - start + 1;
    }
    this.notReceivingBytesTimeout = new Timeout(this.abortOnTimeout);

    const { type } = this.segment.stream;
    this._logger = debug(`p2pml-core:request-${type}`);
  }

  clearLoadedBytes() {
    this._loadedBytes = 0;
    this.bytes = [];
    this._totalBytes = undefined;
    this.finalData = undefined;
  }

  get status() {
    return this._status;
  }

  /** The download attempt under way: open from `loading` until it settles. */
  private downloadToken?: DiagnosticsToken;

  /** The tag of the attempt under way, if it has one. */
  get attemptTag(): AttemptTag | undefined {
    return this._status === "loading" ? this.currentAttempt?.tag : undefined;
  }

  /**
   * Tags the attempt under way with why it was started. The tag stays with
   * the attempt: a failed attempt keeps it in `failedAttempts`.
   */
  tagAttempt(tag: AttemptTag) {
    if (this._status !== "loading" || !this.currentAttempt) return;
    this.currentAttempt.tag = tag;
    this.logger(
      `${this.currentAttempt.downloadSource} ${this.segment.externalId} is the ${tag} attempt`,
    );
  }

  private setStatus(status: RequestStatus) {
    if (
      this._status === "loading" &&
      status !== "loading" &&
      this.downloadToken
    ) {
      diagnostics?.close(this.downloadToken, status);
      diagnostics?.count(
        `Download:${this.currentAttempt?.downloadSource ?? "?"}:${status}`,
      );
      this.downloadToken = undefined;
    }
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

  /**
   * Seconds the attempt under way needs to finish at the speed it has had so
   * far, from its response's start. Unknown — `undefined` — for a request not
   * loading, of unknown size, with no bytes yet, or younger than a tenth of a
   * second: its first chunks arrive in a burst, and say little of its speed.
   */
  get secondsToComplete(): number | undefined {
    const { progress } = this;
    if (this._status !== "loading" || !progress) return undefined;
    if (this._totalBytes === undefined || progress.loadedBytes === 0) {
      return undefined;
    }
    const since = progress.responseTimestamp ?? progress.startTimestamp;
    const elapsed = (performance.now() - since) / 1000;
    if (elapsed < 0.1) return undefined;
    const remaining = Math.max(0, this._totalBytes - this._loadedBytes);
    return remaining / (progress.loadedBytes / elapsed);
  }

  get data(): ArrayBuffer {
    this.finalData ??= Utils.joinChunks(this.bytes).buffer;
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

  /**
   * Checks if all bytes are already loaded and, if so, starts, validates,
   * and completes the request without making a network request.
   *
   * Handles three cases:
   * - loadedBytes === totalBytes: start → validate → complete (returns true)
   * - loadedBytes > totalBytes: corrupted state → clearLoadedBytes (returns false)
   * - otherwise: no-op (returns false)
   *
   * The request is started synchronously so that processQueue sees
   * it as "loading" immediately. Validation runs as fire-and-forget.
   *
   * @returns true if the request was started and is being handled,
   * false if caller should proceed with a normal download.
   */
  tryCompleteByLoadedBytes(
    requestData: StartRequestParameters,
    controls: {
      notReceivingBytesTimeoutMs?: number;
      firstByteTimeoutMs?: number;
      onAbort: (errorType: RequestError<RequestAbortErrorType>) => void;
    },
    validate:
      | ((
          url: string,
          byteRange: Segment["byteRange"],
          data: ArrayBuffer,
        ) => Promise<boolean>)
      | undefined,
    validationErrorType: RequestErrorType,
  ): boolean {
    if (!this._totalBytes) return false;

    if (this._loadedBytes > this._totalBytes) {
      this.logger(
        `${requestData.downloadSource} ${this.segment.externalId} loaded bytes overflow: ${this._loadedBytes} > ${this._totalBytes}, clearing`,
      );
      this.clearLoadedBytes();
      return false;
    }

    if (this._loadedBytes !== this._totalBytes) return false;

    // Start synchronously so the request is immediately in "loading" status.
    const requestControls = this.start(requestData, controls);

    // No network bytes will arrive in this path, so disable the timeout
    // to prevent it from aborting the request during async validation.
    this.notReceivingBytesTimeout.clear();

    if (validate) {
      void this.validateAndComplete(
        requestData.downloadSource,
        requestControls,
        validate,
        validationErrorType,
      );
    } else {
      requestControls.completeOnSuccess();
    }

    return true;
  }

  async validateData(
    validate?: (
      url: string,
      byteRange: Segment["byteRange"],
      data: ArrayBuffer,
    ) => Promise<boolean>,
  ): Promise<boolean> {
    if (!validate) return true;
    try {
      return await validate(
        this.segment.url,
        this.segment.byteRange,
        this.data,
      );
    } catch (err) {
      this.logger(`validation threw an error: ${String(err)}`);
      return false;
    }
  }

  private async validateAndComplete(
    downloadSource: "http" | "p2p",
    requestControls: RequestControls,
    validate: (
      url: string,
      byteRange: Segment["byteRange"],
      data: ArrayBuffer,
    ) => Promise<boolean>,
    validationErrorType: RequestErrorType,
  ) {
    const isValid = await this.validateData(validate);

    // Request may have been aborted by processQueue while validation ran.
    if (this._status !== "loading") return;

    if (!isValid) {
      this.logger(
        `${downloadSource} ${this.segment.externalId} validation failed for already-loaded bytes, clearing`,
      );
      this.clearLoadedBytes();
      requestControls.failWithError(new RequestError(validationErrorType));
      return;
    }

    this.logger(
      `${downloadSource} ${this.segment.externalId} validation passed for already-loaded bytes`,
    );
    requestControls.completeOnSuccess();
  }

  start(
    requestData: StartRequestParameters,
    controls: {
      notReceivingBytesTimeoutMs?: number;
      /**
       * How long to wait for the response to start, where the source has
       * a response that starts — HTTP's headers. Until `startResponse`,
       * this limit applies in place of `notReceivingBytesTimeoutMs`.
       */
      firstByteTimeoutMs?: number;
      onAbort: (errorType: RequestError<RequestAbortErrorType>) => void;
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
    this.downloadToken = diagnostics?.open(
      `Download:${requestData.downloadSource}`,
      String(this.segment.externalId),
    );
    this.progress = {
      startFromByte: this._loadedBytes,
      loadedBytes: 0,
      startTimestamp: performance.now(),
    };
    this.manageBandwidthCalculatorsState("start");

    const { notReceivingBytesTimeoutMs, firstByteTimeoutMs } = controls;
    this._onAbortCallback = controls.onAbort;
    this.notReceivingBytesTimeoutMs = notReceivingBytesTimeoutMs;
    this.firstByteTimeoutMs = firstByteTimeoutMs;

    const timeoutMs = firstByteTimeoutMs ?? notReceivingBytesTimeoutMs;
    if (timeoutMs !== undefined) this.notReceivingBytesTimeout.start(timeoutMs);

    this.logger(
      `${requestData.downloadSource} ${this.segment.externalId} started`,
    );

    this.onSegmentStart({
      segment: mapSegmentWithStreamToSegment(this.segment),
      downloadSource: requestData.downloadSource,
      peerId:
        requestData.downloadSource === "p2p" ? requestData.peerId : undefined,
      infoHash: this.infoHash,
      streamType: this.segment.stream.type,
    });

    return {
      addLoadedChunk: this.addLoadedChunk,
      startResponse: this.startResponse,
      completeOnSuccess: this.completeOnSuccess,
      failWithError: this.failWithError,
    };
  }

  /**
   * The response has started: its headers arrived. From here on the wait is
   * for bytes, under `notReceivingBytesTimeoutMs`, counted from now.
   */
  private startResponse = () => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.progress) return;
    this.progress.responseTimestamp = performance.now();
    if (this.notReceivingBytesTimeoutMs === undefined) {
      this.notReceivingBytesTimeout.clear();
    } else {
      this.notReceivingBytesTimeout.restart(this.notReceivingBytesTimeoutMs);
    }
  };

  cancel() {
    this.throwErrorIfNotLoadingStatus();
    this.setStatus("aborted");
    this.logger(
      `${this.currentAttempt?.downloadSource} ${this.segment.externalId} aborted`,
    );
    this._onAbortCallback?.(new RequestError("abort"));
    this.onSegmentAbort({
      segment: mapSegmentWithStreamToSegment(this.segment),
      downloadSource: this.currentAttempt?.downloadSource,
      peerId:
        this.currentAttempt?.downloadSource === "p2p"
          ? this.currentAttempt.peerId
          : undefined,
      infoHash: this.infoHash,
      streamType: this.segment.stream.type,
    });
    this._onAbortCallback = undefined;
    this.manageBandwidthCalculatorsState("stop");
    this.notReceivingBytesTimeout.clear();
  }

  private abortOnTimeout = () => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt || !this.progress) return;

    // Until the response starts, the wait is for it, under its own limit.
    const { responseTimestamp, lastLoadedChunkTimestamp, startTimestamp } =
      this.progress;
    const waitingForResponse =
      this.firstByteTimeoutMs !== undefined &&
      responseTimestamp === undefined &&
      lastLoadedChunkTimestamp === undefined;
    const limitMs = waitingForResponse
      ? this.firstByteTimeoutMs
      : this.notReceivingBytesTimeoutMs;
    if (limitMs === undefined) return;

    const now = performance.now();
    const lastActive =
      lastLoadedChunkTimestamp ?? responseTimestamp ?? startTimestamp;
    const msSinceLastActive = now - lastActive;

    if (msSinceLastActive < limitMs) {
      // False alarm! The stream is still downloading. Reschedule the timer.
      this.notReceivingBytesTimeout.restart(limitMs - msSinceLastActive);
      return;
    }

    const error = new RequestError("bytes-receiving-timeout");
    this._onAbortCallback?.(error);
    this.handleFailure(error);
  };

  private failWithError = (error: RequestError) => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt) return;

    this.handleFailure(error);
  };

  private handleFailure = (error: RequestError) => {
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
      segment: mapSegmentWithStreamToSegment(this.segment),
      error,
      downloadSource: this.currentAttempt.downloadSource,
      peerId:
        this.currentAttempt.downloadSource === "p2p"
          ? this.currentAttempt.peerId
          : undefined,
      infoHash: this.infoHash,
      streamType: this.segment.stream.type,
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
    this.setStatus("succeed");
    this._totalBytes = this._loadedBytes;
    this.onSegmentLoaded({
      segment: mapSegmentWithStreamToSegment(this.segment),
      bytesLength: this.data.byteLength,
      downloadSource: this.currentAttempt.downloadSource,
      peerId:
        this.currentAttempt.downloadSource === "p2p"
          ? this.currentAttempt.peerId
          : undefined,
      infoHash: this.infoHash,
      streamType: this.segment.stream.type,
    });

    this.logger(
      `${this.currentAttempt.downloadSource} ${this.segment.externalId} succeed`,
    );
    this.requestProcessQueueCallback();
  };

  private addLoadedChunk = (chunk: Uint8Array) => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt || !this.progress) return;

    const { byteLength } = chunk;
    const downloads = this.bandwidthDownloads;
    if (downloads) {
      const { all: allBC, http: httpBC } = this.bandwidthCalculators;
      allBC.addBytes(downloads.all, byteLength);
      if (downloads.http) httpBC.addBytes(downloads.http, byteLength);
    }

    this.bytes.push(chunk);
    this.progress.lastLoadedChunkTimestamp = performance.now();
    this.progress.loadedBytes += byteLength;
    this._loadedBytes += byteLength;
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
    if (state === "start") {
      this.bandwidthDownloads = {
        all: all.startLoading(),
        http:
          this.currentAttempt?.downloadSource === "http"
            ? http.startLoading()
            : undefined,
      };
      return;
    }
    const downloads = this.bandwidthDownloads;
    this.bandwidthDownloads = undefined;
    if (!downloads) return;
    all.stopLoading(downloads.all);
    if (downloads.http) http.stopLoading(downloads.http);
  }
}

class FailedRequestAttempts {
  private attempts: FailedAttempt[] = [];

  add(attempt: FailedAttempt) {
    this.attempts.push(attempt);
  }

  get httpAttemptsCount() {
    return this.attempts.reduce(
      (sum, attempt) => (attempt.downloadSource === "http" ? sum + 1 : sum),
      0,
    );
  }

  get p2pAttemptsCount() {
    return this.attempts.reduce(
      (sum, attempt) => (attempt.downloadSource === "p2p" ? sum + 1 : sum),
      0,
    );
  }

  /** Whether a failed attempt has the tag. */
  hasTag(tag: AttemptTag): boolean {
    return this.attempts.some((attempt) => attempt.tag === tag);
  }

  get lastAttempt(): Readonly<FailedAttempt> | undefined {
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
    this.clear();
    if (ms !== undefined) this.ms = ms;
    if (this.ms === undefined) return;
    this.timeoutId = window.setTimeout(this.action, this.ms);
  }

  clear() {
    clearTimeout(this.timeoutId);
    this.timeoutId = undefined;
  }
}
