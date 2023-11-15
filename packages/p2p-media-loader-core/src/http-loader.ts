import { Settings } from "./types";
import { Request, RequestError, HttpRequestErrorType } from "./request";

export async function fulfillHttpSegmentRequest(
  request: Request,
  settings: Pick<Settings, "httpDownloadTimeoutMs">
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
  const requestControls = request.start(
    { type: "http" },
    {
      abort: (errorType) => abortController.abort(errorType),
      fullLoadingTimeoutMs: settings.httpDownloadTimeoutMs,
    }
  );
  try {
    const fetchResponse = await window.fetch(url, {
      headers,
      signal: abortController.signal,
    });
    requestControls.firstBytesReceived();

    if (fetchResponse.ok) {
      if (!fetchResponse.body) return;

      const totalBytesString = fetchResponse.headers.get("Content-Length");
      if (totalBytesString) request.setTotalBytes(+totalBytesString);

      const reader = fetchResponse.body.getReader();
      for await (const chunk of readStream(reader)) {
        requestControls.addLoadedChunk(chunk);
      }
      requestControls.completeOnSuccess();
    }
    throw new RequestError("fetch-error", fetchResponse.statusText);
  } catch (error) {
    if (error instanceof Error) {
      let httpLoaderError: RequestError<HttpRequestErrorType>;
      if (!(error instanceof RequestError)) {
        httpLoaderError = new RequestError("fetch-error", error.message);
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
