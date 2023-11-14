import { Settings } from "./types";
import { Request } from "./request";

export async function fulfillHttpSegmentRequest(
  request: Request,
  settings: Pick<Settings, "httpRequestTimeout">
) {
  const headers = new Headers();
  const { segment } = request;
  const { url, byteRange } = segment;

  if (byteRange) {
    const { start, end } = byteRange;
    const byteRangeString = `bytes=${start}-${end}`;
    headers.set("Range", byteRangeString);
  }

  const abortController = new AbortController();

  const requestAbortTimeout = setTimeout(() => {
    const errorType: HttpLoaderError["type"] = "request-timeout";
    abortController.abort(errorType);
  }, settings.httpRequestTimeout);

  const abortManually = () => {
    const abortErrorType: HttpLoaderError["type"] = "manual-abort";
    abortController.abort(abortErrorType);
  };

  const requestControls = request.start("http", abortManually);
  try {
    const fetchResponse = await window.fetch(url, {
      headers,
      signal: abortController.signal,
    });

    if (fetchResponse.ok) {
      if (!fetchResponse.body) return;

      const totalBytesString = fetchResponse.headers.get("Content-Length");
      if (totalBytesString) request.setTotalBytes(+totalBytesString);

      const reader = fetchResponse.body.getReader();
      for await (const chunk of readStream(reader)) {
        requestControls.addLoadedChunk(chunk);
      }
      requestControls.completeOnSuccess();
      clearTimeout(requestAbortTimeout);
    }
    throw new HttpLoaderError("fetch-error", fetchResponse.statusText);
  } catch (error) {
    if (error instanceof Error) {
      let httpLoaderError: HttpLoaderError;
      if ((error.name as HttpLoaderError["type"]) === "manual-abort") {
        httpLoaderError = new HttpLoaderError("manual-abort");
      } else if (
        (error.name as HttpLoaderError["type"]) === "request-timeout"
      ) {
        httpLoaderError = new HttpLoaderError("request-timeout");
      } else if (!(error instanceof HttpLoaderError)) {
        httpLoaderError = new HttpLoaderError("fetch-error", error.message);
      } else {
        httpLoaderError = error;
      }
      requestControls.cancelOnError(httpLoaderError);
    }
  }
}

async function* readStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<Uint8Array> {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield value;
  }
}

export class HttpLoaderError extends Error {
  constructor(
    readonly type: "request-timeout" | "fetch-error" | "manual-abort",
    message?: string
  ) {
    super(message);
  }
}
