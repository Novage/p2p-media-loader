import { Settings } from "./types";
import {
  Request as SegmentRequest,
  RequestError,
  HttpRequestErrorType,
  RequestControls,
} from "./requests/request";

type HttpSettings = Pick<
  Settings,
  "httpNotReceivingBytesTimeoutMs" | "httpRequestSetup"
>;

export class HttpRequestExecutor {
  private readonly requestControls: RequestControls;
  private readonly abortController = new AbortController();
  private readonly expectedBytesLength?: number;
  private readonly requestByteRange?: { start: number; end?: number };

  constructor(
    private readonly request: SegmentRequest,
    private readonly settings: HttpSettings,
  ) {
    const { byteRange } = this.request.segment;
    if (byteRange) this.requestByteRange = { ...byteRange };

    if (request.loadedBytes !== 0) {
      this.requestByteRange = this.requestByteRange ?? { start: 0 };
      this.requestByteRange.start =
        this.requestByteRange.start + request.loadedBytes;
    }
    if (this.request.totalBytes) {
      this.expectedBytesLength =
        this.request.totalBytes - this.request.loadedBytes;
    }

    const { httpNotReceivingBytesTimeoutMs } = this.settings;
    this.requestControls = this.request.start(
      { type: "http" },
      {
        abort: () => this.abortController.abort("abort"),
        notReceivingBytesTimeoutMs: httpNotReceivingBytesTimeoutMs,
      },
    );
    void this.fetch();
  }

  private async fetch() {
    const { segment } = this.request;
    try {
      const headers = new Headers(
        this.requestByteRange
          ? {
              Range: `bytes=${this.requestByteRange.start}-${
                this.requestByteRange.end ?? ""
              }`,
            }
          : undefined,
      );

      const request =
        this.settings.httpRequestSetup?.(
          segment.url,
          this.requestByteRange,
          segment.byteRange,
        ) ??
        new Request(segment.url, {
          headers,
          signal: this.abortController.signal,
        });

      const response = await window.fetch(request);

      this.handleResponseHeaders(response);

      if (!response.body) return;
      const { requestControls } = this;
      requestControls.firstBytesReceived();

      const reader = response.body.getReader();
      for await (const chunk of readStream(reader)) {
        this.requestControls.addLoadedChunk(chunk);
      }
      requestControls.completeOnSuccess();
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleResponseHeaders(response: Response) {
    if (!response.ok) {
      if (response.status === 406) {
        this.request.clearLoadedBytes();
        throw new RequestError("http-bytes-mismatch", response.statusText);
      } else {
        throw new RequestError("http-error", response.statusText);
      }
    }

    const { requestByteRange: byteRange } = this;
    if (byteRange) {
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
          const { from, to, total } = contentRange;
          if (
            (total !== undefined && this.request.totalBytes !== total) ||
            (from !== undefined && byteRange.start !== from) ||
            (to !== undefined &&
              byteRange.end !== undefined &&
              byteRange.end !== to)
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

  private handleError(error: unknown) {
    if (error instanceof Error) {
      if (error.name !== "abort") return;

      const httpLoaderError =
        error instanceof RequestError
          ? (error as RequestError<HttpRequestErrorType>)
          : new RequestError("http-error", error.message);

      this.requestControls.abortOnError(httpLoaderError);
    }
  }
}

async function* readStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield value;
  }
}

function parseContentRangeHeader(headerValue: string) {
  const match = headerValue
    .trim()
    .match(/^bytes (?:(?:(\d+)|)-(?:(\d+)|)|\*)\/(?:(\d+)|\*)$/);
  if (!match) return;

  const [, from, to, total] = match;
  return {
    from: from ? parseInt(from) : undefined,
    to: to ? parseInt(to) : undefined,
    total: total ? parseInt(total) : undefined,
  };
}
