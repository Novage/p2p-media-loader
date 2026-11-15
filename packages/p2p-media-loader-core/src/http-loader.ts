import { CoreConfig, CoreEventMap, RequestError } from "./types.js";
import {
  PeerDataFault,
  Request as SegmentRequest,
  RequestControls,
} from "./requests/request.js";
import { EventTarget } from "./utils/event-target.js";
import {
  SafeAbortController,
  isAbortControllerSupported,
} from "./utils/abort-controller.js";

type HttpConfig = Pick<
  CoreConfig,
  | "httpNotReceivingBytesTimeoutMs"
  | "httpFirstByteTimeoutMs"
  | "httpRequestSetup"
  | "validateP2PSegment"
>;

export class HttpRequestExecutor {
  private readonly abortController = new SafeAbortController();
  /** The peer whose bytes or size this attempt failed on, if one did. */
  private faultPeerId?: string;
  private expectedBytesLength?: number;
  private requestByteRange?: { start: number; end?: number };
  private readonly onChunkDownloaded: CoreEventMap["onChunkDownloaded"];

  private isAborted(): boolean {
    return this.abortController.signal.aborted;
  }

  /**
   * @param priority - The fetch priority of the request the core builds:
   * `"high"` for a segment its player has requested, `"low"` for prefetch.
   * A browser without fetch priorities ignores it; a request built by
   * `httpRequestSetup` keeps its own.
   * @param onPeerBytesRejected - Called with the peer whose bytes this
   * download went on from, when they prove wrong, and why: the whole segment
   * failed `validateP2PSegment`, or HTTP gave another size. The caller closes
   * the connection to that peer with that cause.
   */
  constructor(
    private readonly request: SegmentRequest,
    private readonly httpConfig: HttpConfig,
    eventTarget: EventTarget<CoreEventMap>,
    private readonly priority: RequestPriority,
    private readonly onPeerBytesRejected: (
      peerId: string,
      cause: PeerDataFault,
    ) => void = () => undefined,
  ) {
    this.onChunkDownloaded =
      eventTarget.getEventDispatcher("onChunkDownloaded");

    const { byteRange } = this.request.segment;
    if (byteRange) this.requestByteRange = { ...byteRange };
  }

  execute() {
    const startControls = {
      onAbort: () => this.abortController.abort(),
      notReceivingBytesTimeoutMs:
        this.httpConfig.httpNotReceivingBytesTimeoutMs,
      firstByteTimeoutMs: this.httpConfig.httpFirstByteTimeoutMs,
    };

    // All the bytes held: completed as the source that sent them. A peer's
    // are validated as that peer's; a failure closes it.
    const completed = this.request.tryCompleteByLoadedBytes(
      undefined,
      startControls,
      this.httpConfig.validateP2PSegment,
      this.onPeerBytesRejected,
    );

    if (completed) return;

    if (this.request.loadedBytes !== 0) {
      this.requestByteRange = this.requestByteRange ?? { start: 0 };
      this.requestByteRange.start =
        this.requestByteRange.start + this.request.loadedBytes;
    }
    if (this.request.totalBytes) {
      this.expectedBytesLength =
        this.request.totalBytes - this.request.loadedBytes;
    }

    const requestControls = this.request.start(
      { downloadSource: "http" },
      startControls,
    );
    void this.fetch(requestControls);
  }

  private async fetch(requestControls: RequestControls) {
    const { segment } = this.request;
    let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let response: Response | undefined;

    if (this.isAborted()) {
      return;
    }

    const onAbort = () => {
      try {
        activeReader?.cancel().catch(() => {
          // Swallow stream cancel errors
        });
      } catch {
        // Swallow stream cancel errors
      }
    };

    this.abortController.signal.addEventListener("abort", onAbort);

    const abortSignal = isAbortControllerSupported
      ? (this.abortController.signal as AbortSignal)
      : undefined;

    try {
      let request = await this.httpConfig.httpRequestSetup?.(
        segment.url,
        segment.byteRange,
        abortSignal,
        this.requestByteRange,
      );

      if (this.isAborted()) {
        throw new DOMException("Request aborted", "AbortError");
      }

      if (!request) {
        // Use default empty Headers constructor and set fields individually for compatibility
        // with older browsers (e.g. Chrome < 47) that do not support passing an object parameter.
        const headers = new Headers();
        if (this.requestByteRange) {
          headers.set(
            "Range",
            `bytes=${this.requestByteRange.start}-${
              this.requestByteRange.end ?? ""
            }`,
          );
        }

        const requestOptions: RequestInit = {
          headers,
          priority: this.priority,
        };
        if (abortSignal) {
          requestOptions.signal = abortSignal;
        }

        request = new Request(segment.url, requestOptions);
      }

      if (this.isAborted()) {
        throw new DOMException(
          "Request aborted before request fetch",
          "AbortError",
        );
      }

      response = await window.fetch(request);

      if (this.isAborted()) {
        throw new DOMException("Request aborted", "AbortError");
      }
      requestControls.startResponse();

      this.handleResponseHeaders(response);

      if (!response.body || typeof response.body.getReader !== "function") {
        // Fallback for older browsers (e.g. Chrome < 43) that do not support ReadableStream
        // or response.body.getReader. Reads the entire segment into an ArrayBuffer instead.
        const arrayBuffer = await response.arrayBuffer();
        if (this.isAborted()) {
          throw new DOMException("Request aborted", "AbortError");
        }
        const value = new Uint8Array(arrayBuffer);
        requestControls.addLoadedChunk(value);
        this.onChunkDownloaded(
          value.byteLength,
          "http",
          undefined,
          segment.stream.type,
          this.request.infoHash,
        );
      } else {
        const reader = response.body.getReader();
        activeReader = reader;

        for (;;) {
          if (this.isAborted()) {
            throw new DOMException("Request aborted", "AbortError");
          }
          const { done, value } = await reader.read();
          if (done) break;
          if (this.isAborted()) {
            throw new DOMException("Request aborted", "AbortError");
          }
          requestControls.addLoadedChunk(value);
          this.onChunkDownloaded(
            value.byteLength,
            "http",
            undefined,
            segment.stream.type,
            this.request.infoHash,
          );
        }
      }

      if (this.isAborted()) {
        throw new DOMException("Request aborted", "AbortError");
      }

      // If the HTTP connection drops gracefully but prematurely, fetch yields done: true
      // without throwing an error. We must verify that we received the full segment.
      // If truncated, we throw without clearing loaded bytes to allow the next
      // download attempt to resume from the current offset using HTTP Range requests.
      const { heldBytes } = this.request;
      const { sizePeer } = heldBytes;
      if (sizePeer !== undefined && heldBytes.isOverflow) {
        // More than the size a peer gave: that peer's size was wrong.
        throw this.rejectPeer(
          sizePeer,
          "p2p-segment-size-mismatch",
          "HTTP sent more than its size",
        );
      }
      if (heldBytes.isShort || heldBytes.isOverflow) {
        const problem = heldBytes.isShort ? "truncated" : "too long";
        throw new RequestError(
          "http-bytes-mismatch",
          `HTTP response ${problem}: received ${this.request.loadedBytes} of ${this.request.totalBytes} bytes`,
        );
      }

      // A 200 with no body is not a segment. Nothing downstream would notice:
      // it would be stored, announced, seeded to peers and appended by the
      // player, which is a stall or a rendition exclusion rather than an error.
      // Failing the attempt leaves the retry rules to deal with it.
      if (this.request.loadedBytes === 0) {
        this.request.clearLoadedBytes();
        throw new RequestError<"http-bytes-mismatch">(
          "http-bytes-mismatch",
          "HTTP response carried no bytes",
        );
      }

      // HTTP is trusted: only a download that went on from a peer's bytes
      // is validated, as that peer's.
      if (this.isPeersDownload()) {
        const isValid = await this.request.validateData(
          this.httpConfig.validateP2PSegment,
        );
        if (this.isAborted()) {
          throw new DOMException("Request aborted", "AbortError");
        }
        if (!isValid) {
          throw this.rejectPeer(
            this.request.heldBytes.owner,
            "p2p-segment-validation-failed",
            "the segment failed validation",
          );
        }
      }

      requestControls.completeOnSuccess();
    } catch (error) {
      // A response refused on its headers is never read. Its body would keep
      // the connection busy until the response is garbage-collected, and an
      // HTTP/1.1 host has six connections for every tab of the browser.
      if (!activeReader && response?.body && !response.bodyUsed) {
        response.body.cancel().catch(() => {
          // Swallow stream cancel errors
        });
      }
      this.handleError(error, requestControls);
    } finally {
      this.abortController.signal.removeEventListener("abort", onAbort);
    }
  }

  private handleResponseHeaders(response: Response) {
    if (!response.ok) {
      if (response.status === 406 || response.status === 416) {
        const sizePeer = this.request.heldBytes.peerForExcessBytes;
        if (response.status === 416 && sizePeer !== undefined) {
          // The bytes held go past the end of the segment HTTP has: the
          // peer that gave the size, or sent them, was wrong.
          throw this.rejectPeer(
            sizePeer,
            "p2p-segment-size-mismatch",
            "more bytes than HTTP has",
          );
        }
        this.request.clearLoadedBytes();
        throw new RequestError<"http-bytes-mismatch">(
          "http-bytes-mismatch",
          response.statusText,
        );
      } else {
        throw new RequestError<"http-error">("http-error", response.statusText);
      }
    }

    const { requestByteRange } = this;
    if (requestByteRange) {
      if (response.status === 200) {
        if (this.request.segment.byteRange) {
          throw new RequestError("http-unexpected-status-code");
        } else {
          this.request.clearLoadedBytes();
        }
      } else {
        if (response.status !== 206) {
          throw new RequestError(
            "http-unexpected-status-code",
            response.statusText,
          );
        }
        const contentLengthHeader = response.headers.get("Content-Length");
        const isLengthChecked =
          !!contentLengthHeader && this.expectedBytesLength !== undefined;
        if (
          isLengthChecked &&
          this.expectedBytesLength !== Number(contentLengthHeader)
        ) {
          throw this.sizeMismatch(response);
        }
        let isSizeChecked = isLengthChecked;

        const contentRangeHeader = response.headers.get("Content-Range");
        const contentRange = contentRangeHeader
          ? parseContentRangeHeader(contentRangeHeader)
          : undefined;
        if (contentRange) {
          const { from, to, total } = contentRange;
          const responseExpectedBytesLength =
            to !== undefined && from !== undefined ? to - from + 1 : undefined;
          // The total is the file's: the segment's own size only where it
          // has no byte range.
          const isTotalChecked =
            !this.request.segment.byteRange &&
            total !== undefined &&
            this.request.totalBytes !== undefined;
          const isRangeLengthChecked =
            responseExpectedBytesLength !== undefined &&
            this.expectedBytesLength !== undefined;

          if (
            (isRangeLengthChecked &&
              this.expectedBytesLength !== responseExpectedBytesLength) ||
            (isTotalChecked && total !== this.request.totalBytes) ||
            (from !== undefined && requestByteRange.start !== from) ||
            (to !== undefined &&
              requestByteRange.end !== undefined &&
              requestByteRange.end !== to)
          ) {
            throw this.sizeMismatch(response);
          }
          isSizeChecked ||= isRangeLengthChecked || isTotalChecked;
          // A request that goes on from bytes of unknown size learns it here,
          // so a body cut short is still found.
          if (total !== undefined && this.request.totalBytes === undefined) {
            this.request.setTotalBytes(total);
          }
        }
        // HTTP checked the size and agrees with it: the size is HTTP's now.
        if (isSizeChecked) this.request.confirmTotalBytes();
      }
    }

    if (response.status === 200) {
      // A 200 is HTTP's whole answer, and no bytes are held by now. It drops
      // a size a peer gave — a failed peer download can leave one behind with
      // no bytes — and judges no peer: a peer is judged only on bytes it sent.
      if (this.request.heldBytes.sizePeer !== undefined) {
        this.request.clearLoadedBytes();
      }
      // With Content-Encoding, Content-Length is the encoded length, and the
      // body fetch gives is the decoded one: it is not the segment's size. A
      // cross-origin response shows the header only if the server exposes it.
      const contentLengthHeader = response.headers.get("Content-Length");
      const encoding = response.headers.get("Content-Encoding")?.trim();
      const isEncoded = !!encoding && encoding.toLowerCase() !== "identity";
      if (
        contentLengthHeader &&
        !isEncoded &&
        this.request.totalBytes === undefined
      ) {
        this.request.setTotalBytes(+contentLengthHeader);
      }
    }
  }

  /**
   * Whether this download is a peer's: a peer sent some of the bytes held,
   * and `validateP2PSegment` is set. It is validated as the peer's, whichever
   * source finishes it.
   */
  private isPeersDownload(): boolean {
    return (
      this.httpConfig.validateP2PSegment !== undefined &&
      this.request.heldBytes.hasPeerBytes
    );
  }

  /**
   * Clears the bytes held and tells the caller of the peer at fault. The
   * attempt fails as that peer's fault: it does not spend one of the
   * request's HTTP attempts.
   */
  private rejectPeer(
    peerId: string | undefined,
    type: "p2p-segment-validation-failed" | "p2p-segment-size-mismatch",
    reason: string,
  ) {
    this.request.clearLoadedBytes();
    if (peerId !== undefined) {
      this.onPeerBytesRejected(
        peerId,
        type === "p2p-segment-validation-failed"
          ? "validation-failed"
          : "bytes-length-mismatch",
      );
    }
    this.faultPeerId = peerId;
    return new RequestError(type, `peer ${peerId ?? "?"}: ${reason}`);
  }

  /**
   * HTTP gives another size than expected. HTTP is the truth: where a peer
   * gave the size, that peer was wrong, with or without a validator. Where
   * the size came from HTTP itself or from the byte range, it is HTTP's
   * failure.
   */
  private sizeMismatch(response: Response) {
    const { sizePeer } = this.request.heldBytes;
    if (sizePeer !== undefined) {
      return this.rejectPeer(
        sizePeer,
        "p2p-segment-size-mismatch",
        "HTTP has another size",
      );
    }
    this.request.clearLoadedBytes();
    return new RequestError("http-bytes-mismatch", response.statusText);
  }

  private handleError(error: unknown, requestControls: RequestControls) {
    // Abort-initiated errors: the Request already transitioned its own
    // status via cancel/abortOnTimeout, nothing to do here.
    if (this.isAborted()) return;

    if (error instanceof Error) {
      const httpLoaderError =
        error instanceof RequestError
          ? (error as RequestError)
          : new RequestError("http-error", error.message);

      requestControls.failWithError(httpLoaderError, this.faultPeerId);
    }
  }
}

const rangeHeaderRegex = /^bytes (?:(?:(\d+)|)-(?:(\d+)|)|\*)\/(?:(\d+)|\*)$/;

function parseContentRangeHeader(headerValue: string) {
  const match = rangeHeaderRegex.exec(headerValue.trim());
  if (!match) return;

  const [, from, to, total] = match;
  return {
    from: from ? parseInt(from) : undefined,
    to: to ? parseInt(to) : undefined,
    total: total ? parseInt(total) : undefined,
  };
}
