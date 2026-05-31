import {
  CoreConfig,
  CoreEventMap,
  RequestError,
  HttpRequestErrorType,
} from "./types.js";
import {
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
  "httpNotReceivingBytesTimeoutMs" | "httpRequestSetup" | "validateHTTPSegment"
>;

export class HttpRequestExecutor {
  private readonly abortController = new SafeAbortController();
  private expectedBytesLength?: number;
  private requestByteRange?: { start: number; end?: number };
  private readonly onChunkDownloaded: CoreEventMap["onChunkDownloaded"];

  private isAborted(): boolean {
    return this.abortController.signal.aborted;
  }

  constructor(
    private readonly request: SegmentRequest,
    private readonly httpConfig: HttpConfig,
    eventTarget: EventTarget<CoreEventMap>,
  ) {
    this.onChunkDownloaded =
      eventTarget.getEventDispatcher("onChunkDownloaded");

    const { byteRange } = this.request.segment;
    if (byteRange) this.requestByteRange = { ...byteRange };
  }

  execute() {
    const startControls = {
      abort: () => this.abortController.abort(),
      notReceivingBytesTimeoutMs:
        this.httpConfig.httpNotReceivingBytesTimeoutMs,
    };

    const completed = this.request.tryCompleteByLoadedBytes(
      { downloadSource: "http" },
      startControls,
      this.httpConfig.validateHTTPSegment,
      "http-segment-validation-failed",
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

        const requestOptions: RequestInit = { headers };
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

      const response = await window.fetch(request);

      if (this.isAborted()) {
        throw new DOMException("Request aborted", "AbortError");
      }

      this.handleResponseHeaders(response);

      requestControls.firstBytesReceived();

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
      if (
        this.request.totalBytes !== undefined &&
        this.request.loadedBytes !== this.request.totalBytes
      ) {
        throw new RequestError(
          "http-bytes-mismatch",
          `HTTP response truncated: received ${this.request.loadedBytes} of ${this.request.totalBytes} bytes`,
        );
      }

      const isValid = await this.request.validateData(
        this.httpConfig.validateHTTPSegment,
      );

      if (this.isAborted()) {
        throw new DOMException("Request aborted", "AbortError");
      }

      if (!isValid) {
        this.request.clearLoadedBytes();
        throw new RequestError<"http-segment-validation-failed">(
          "http-segment-validation-failed",
        );
      }

      requestControls.completeOnSuccess();
    } catch (error) {
      this.handleError(error, requestControls);
    } finally {
      this.abortController.signal.removeEventListener("abort", onAbort);
    }
  }

  private handleResponseHeaders(response: Response) {
    if (!response.ok) {
      if (response.status === 406 || response.status === 416) {
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
        if (
          contentLengthHeader &&
          this.expectedBytesLength !== undefined &&
          this.expectedBytesLength !== +contentLengthHeader
        ) {
          this.request.clearLoadedBytes();
          throw new RequestError("http-bytes-mismatch", response.statusText);
        }

        const contentRangeHeader = response.headers.get("Content-Range");
        const contentRange = contentRangeHeader
          ? parseContentRangeHeader(contentRangeHeader)
          : undefined;
        if (contentRange) {
          const { from, to } = contentRange;
          const responseExpectedBytesLength =
            to !== undefined && from !== undefined ? to - from + 1 : undefined;

          if (
            (responseExpectedBytesLength !== undefined &&
              this.expectedBytesLength !== responseExpectedBytesLength) ||
            (from !== undefined && requestByteRange.start !== from) ||
            (to !== undefined &&
              requestByteRange.end !== undefined &&
              requestByteRange.end !== to)
          ) {
            this.request.clearLoadedBytes();
            throw new RequestError("http-bytes-mismatch", response.statusText);
          }
        }
      }
    }

    if (response.status === 200 && this.request.totalBytes === undefined) {
      const contentLengthHeader = response.headers.get("Content-Length");
      if (contentLengthHeader) this.request.setTotalBytes(+contentLengthHeader);
    }
  }

  private handleError(error: unknown, requestControls: RequestControls) {
    // Abort-initiated errors: the Request already transitioned its own
    // status via abortFromProcessQueue/abortOnTimeout, nothing to do here.
    if (this.isAborted()) return;

    if (error instanceof Error) {
      const httpLoaderError =
        error instanceof RequestError
          ? (error as RequestError<HttpRequestErrorType>)
          : new RequestError("http-error", error.message);

      requestControls.abortOnError(httpLoaderError);
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
