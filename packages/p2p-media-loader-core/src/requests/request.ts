import { diagnostics, type DiagnosticsToken } from "../diagnostics.js";
import debug from "debug";
import { BandwidthCalculators, SegmentWithStream } from "../internal-types.js";
import type { BandwidthDownload } from "../bandwidth-calculator.js";
import {
  CoreEventMap,
  PeerErrorType,
  RequestError,
  RequestAbortErrorType,
  RequestErrorType,
  Segment,
} from "../types.js";
import {
  HeldBytes,
  type ByteSource,
  type HeldBytesView,
} from "./held-bytes.js";
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

/**
 * Why a peer's data was found wrong: its segment failed `validateP2PSegment`,
 * or its size was contradicted. The peer is closed with this error type.
 */
export type PeerDataFault = Extract<
  PeerErrorType,
  "validation-failed" | "bytes-length-mismatch"
>;

type HttpRequestAttempt = {
  downloadSource: "http";
  tag?: AttemptTag;
  /** Completes from the bytes held, with no network request. */
  fromHeldBytes?: true;
  error?: RequestError;
};

type P2PRequestAttempt = {
  downloadSource: "p2p";
  peerId: string;
  tag?: AttemptTag;
  /** Completes from the bytes held, with no network request. */
  fromHeldBytes?: true;
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
  "error" | "errorTimestamp"
>;
type StartRequestParameters =
  OmitEncapsulated<HttpRequestAttempt> | OmitEncapsulated<P2PRequestAttempt>;

export type RequestStatus =
  "not-started" | "loading" | "succeed" | "failed" | "aborted";

/**
 * Whether an HTTP attempt failed because of a peer's bytes or size that it
 * went on from, not because of the origin.
 */
export function failedOnPeerData(attempt: {
  readonly error: { readonly type: string };
}): boolean {
  return (
    attempt.error.type === "p2p-segment-validation-failed" ||
    attempt.error.type === "p2p-segment-size-mismatch"
  );
}

/**
 * The size of a segment with a byte range. Without one the size is unknown
 * until a response gives it.
 */
function sizeFromByteRange(segment: SegmentWithStream): number | undefined {
  const { byteRange } = segment;
  return byteRange ? byteRange.end - byteRange.start + 1 : undefined;
}

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
  /** The bytes held, with who sent them, and the size, with who gave it. */
  private readonly held: HeldBytes;
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

    this.held = new HeldBytes(sizeFromByteRange(this.segment));
    this.notReceivingBytesTimeout = new Timeout(this.abortOnTimeout);

    const { type } = this.segment.stream;
    this._logger = debug(`p2pml-core:request-${type}`);
  }

  clearLoadedBytes() {
    this.endKept("cleared");
    this.held.clear();
  }

  /** The bytes held and the size, for the rules that read them. */
  get heldBytes(): HeldBytesView {
    return this.held;
  }

  /**
   * Clears the bytes held if any of them came from a peer other than
   * `peerId`, which is about to go on with the download and validate it
   * (`HeldBytes.otherPeerThan`). Bytes from HTTP are trusted and kept.
   */
  dropBytesFromOtherPeers(peerId: string) {
    const other = this.held.otherPeerThan(peerId);
    if (other === undefined) return;
    this.logger(
      `${this.segment.externalId}: ${this.held.length} bytes dropped, some from peer ${other}; peer ${peerId} validates the whole segment`,
    );
    this.clearLoadedBytes();
  }

  get status() {
    return this._status;
  }

  /** The download attempt under way: open from `loading` until it settles. */
  private downloadToken?: DiagnosticsToken;
  /**
   * Stopped with bytes in hand and kept to go on from them: its bytes are
   * held outside the segment storage until it is resumed, its bytes are
   * cleared, or it is let go.
   */
  private kept = false;
  private keptToken?: DiagnosticsToken;

  /**
   * Keeps this stopped request to go on from its bytes.
   *
   * @returns Whether it was not kept before.
   */
  keep(): boolean {
    if (this.kept) return false;
    this.kept = true;
    this.keptToken = diagnostics?.open(
      "PartialRequest",
      String(this.segment.externalId),
    );
    return true;
  }

  /**
   * Ends what `keep` started, and says how: resumed by a new attempt, its
   * bytes cleared, let go as its segment left the queue or as more were kept
   * than there are slots, or destroyed with its loader.
   */
  endKept(
    cause:
      "resumed" | "cleared" | "left-queue" | "dropped-over-limit" | "destroyed",
  ) {
    if (!this.kept) return;
    this.kept = false;
    diagnostics?.close(this.keptToken, cause);
    this.keptToken = undefined;
    if (cause !== "destroyed") diagnostics?.count(`PartialRequest:${cause}`);
  }

  /**
   * Whether the attempt under way completes from the bytes held: it uses no
   * link and no peer, and only waits for `validateP2PSegment`. Stopping it
   * would only start the same validation again.
   */
  get isCompletingFromHeldBytes(): boolean {
    return (
      this._status === "loading" && this.currentAttempt?.fromHeldBytes === true
    );
  }

  /** The tag of the attempt under way, if it has one. */
  get attemptTag(): AttemptTag | undefined {
    return this._status === "loading" ? this.currentAttempt?.tag : undefined;
  }

  /** The tag of the last attempt, under way or ended, if it has one. */
  get lastAttemptTag(): AttemptTag | undefined {
    return this.currentAttempt?.tag;
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
    return this.held.length;
  }

  get totalBytes(): number | undefined {
    return this.held.size;
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
    const total = this.held.size;
    if (total === undefined || progress.loadedBytes === 0) {
      return undefined;
    }
    const since = progress.responseTimestamp ?? progress.startTimestamp;
    const elapsed = (performance.now() - since) / 1000;
    if (elapsed < 0.1) return undefined;
    const remaining = Math.max(0, total - this.held.length);
    return remaining / (progress.loadedBytes / elapsed);
  }

  get data(): ArrayBuffer {
    return this.held.data;
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

  /**
   * Sets the total size, as the attempt under way learned it: from a peer's
   * message, or from HTTP's headers. Which one is recorded, since a size a
   * peer gave can be wrong (`heldBytes.sizePeer`).
   */
  setTotalBytes(value: number) {
    this.held.setSize(value, this.attemptSource());
  }

  /**
   * HTTP's answer agreed with the total size: the size is HTTP's now, and a
   * peer that gives another one later is the one at fault.
   */
  confirmTotalBytes() {
    this.held.confirmSize();
  }

  /** The source of the attempt under way, or HTTP with none. */
  private attemptSource(): ByteSource {
    return this.currentAttempt?.downloadSource === "p2p"
      ? { downloadSource: "p2p", peerId: this.currentAttempt.peerId }
      : { downloadSource: "http" };
  }

  /**
   * Checks if all bytes are already loaded and, if so, starts, validates,
   * and completes the request without making a network request.
   *
   * The attempt is the bytes' own, whichever loader calls this: HTTP's for
   * HTTP bytes only, which are trusted and not validated; otherwise the
   * owning peer's (the latest peer that sent bytes, where several did with
   * nothing to validate them), validated with `validateP2PSegment`. A failure blames
   * that peer through `onPeerBytesRejected`.
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
    tag: AttemptTag | undefined,
    controls: {
      notReceivingBytesTimeoutMs?: number;
      firstByteTimeoutMs?: number;
      onAbort: (errorType: RequestError<RequestAbortErrorType>) => void;
    },
    validateP2PSegment:
      | ((
          url: string,
          byteRange: Segment["byteRange"],
          data: ArrayBuffer,
        ) => Promise<boolean>)
      | undefined,
    onPeerBytesRejected: (peerId: string, cause: PeerDataFault) => void,
  ): boolean {
    const { held } = this;
    if (held.isOverflow) {
      this.logger(
        `${this.segment.externalId} loaded bytes overflow: ${held.length} > ${held.size}, clearing`,
      );
      this.clearLoadedBytes();
      return false;
    }
    if (!held.isComplete) return false;

    const source = held.completionSource;
    const requestData: StartRequestParameters = {
      ...source,
      tag,
      fromHeldBytes: true,
    };
    const { owner } = held;
    const validate =
      source.downloadSource === "http" || validateP2PSegment === undefined
        ? undefined
        : async (...args: Parameters<typeof validateP2PSegment>) => {
            let isValid: boolean;
            try {
              isValid = await validateP2PSegment(...args);
            } catch {
              isValid = false;
            }
            if (!isValid && owner !== undefined) {
              onPeerBytesRejected(owner, "validation-failed");
            }
            return isValid;
          };

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
        "p2p-segment-validation-failed",
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

    this.endKept("resumed");
    this.setStatus("loading");
    this.currentAttempt = { ...requestData };
    this.downloadToken = diagnostics?.open(
      `Download:${requestData.downloadSource}`,
      String(this.segment.externalId),
    );
    this.progress = {
      startFromByte: this.held.length,
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

  /**
   * @param faultPeerId - For an HTTP attempt that failed on a peer's bytes or
   * size it went on from: that peer, which `onSegmentError` names.
   */
  private failWithError = (error: RequestError, faultPeerId?: string) => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.currentAttempt) return;

    this.handleFailure(error, faultPeerId);
  };

  private handleFailure = (error: RequestError, faultPeerId?: string) => {
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
          : faultPeerId,
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
    this.held.settleSize();
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

    this.held.add(chunk, this.attemptSource());
    this.progress.lastLoadedChunkTimestamp = performance.now();
    this.progress.loadedBytes += byteLength;
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

/** The wait before the first HTTP retry; each further one waits twice as long. */
const HTTP_RETRY_WAIT_MS = 1000;
/**
 * How long after its last failure a request's failed attempts are cleared
 * (`clearIfStale`), which gives a prefetch that spent its HTTP attempts new
 * ones. This value and the cap below are stated in the `httpErrorRetries`
 * doc (types.ts), specs/playback-contract.md ("Urgency") and the CHANGELOG:
 * a change here changes them too.
 */
const FAILED_ATTEMPTS_CLEAR_INTERVAL = 60000;
/**
 * The longest wait: half the clear interval. A wait as long as the interval
 * would end after the attempts it counts are cleared, and `httpErrorRetries`
 * would never be reached; the other half leaves room for the timer that
 * starts the retry.
 */
const HTTP_RETRY_MAX_WAIT_MS = FAILED_ATTEMPTS_CLEAR_INTERVAL / 2;

class FailedRequestAttempts {
  private attempts: FailedAttempt[] = [];

  add(attempt: FailedAttempt) {
    this.attempts.push(attempt);
  }

  /**
   * The HTTP attempts that failed at the origin, oldest first. One that
   * failed on a peer's bytes or size it went on from is not among them: the
   * fault was the peer's, and HTTP's attempts are the request's last resort.
   * The limit of attempts and the wait between them both count these.
   */
  private originHttpFailures(): FailedAttempt[] {
    return this.attempts.filter(
      (attempt) =>
        attempt.downloadSource === "http" && !failedOnPeerData(attempt),
    );
  }

  /** The HTTP attempts that failed at the origin. */
  get httpAttemptsCount() {
    return this.originHttpFailures().length;
  }

  /**
   * When the next HTTP attempt may start: the last origin failure, plus a
   * wait of 1 s that doubles with each such failure, up to 30 s.
   * `undefined` with none.
   * An origin that just failed is often still failing; attempts spread out
   * reach it after a short outage, and leave a peer time to send the segment.
   */
  get httpRetryAt(): number | undefined {
    const failures = this.originHttpFailures();
    if (failures.length === 0) return undefined;
    const wait = Math.min(
      HTTP_RETRY_WAIT_MS * 2 ** (failures.length - 1),
      HTTP_RETRY_MAX_WAIT_MS,
    );
    return failures[failures.length - 1].error.timestamp + wait;
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

  /**
   * Clears the failed attempts once `FAILED_ATTEMPTS_CLEAR_INTERVAL` has
   * passed since the last one, of any kind. That is never before the last
   * origin failure that `httpRetryAt` counts from, so a capped wait always
   * ends first.
   *
   * @returns Whether it cleared them.
   */
  clearIfStale(now: number): boolean {
    const last = this.lastAttempt;
    if (!last || now - last.error.timestamp <= FAILED_ATTEMPTS_CLEAR_INTERVAL) {
      return false;
    }
    this.clear();
    return true;
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
