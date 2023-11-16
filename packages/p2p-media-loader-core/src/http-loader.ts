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
      abort: () => abortController.abort("abort"),
      fullLoadingTimeoutMs: settings.httpDownloadTimeoutMs,
    }
  );
  try {
    const fetchResponse = await window.fetch(url, {
      headers,
      signal: abortController.signal,
    });
    requestControls.firstBytesReceived();

    if (!fetchResponse.ok) {
      throw new RequestError("fetch-error", fetchResponse.statusText);
    }

    if (!fetchResponse.body) return;
    const totalBytesString = fetchResponse.headers.get("Content-Length");
    if (totalBytesString) request.setTotalBytes(+totalBytesString);

    const reader = fetchResponse.body.getReader();
    for await (const chunk of readStream(reader)) {
      requestControls.addLoadedChunk(chunk);
    }
    requestControls.completeOnSuccess();
  } catch (error) {
    if (error instanceof Error) {
      if (error.name !== "abort") return;

      const httpLoaderError: RequestError<HttpRequestErrorType> = !(
        error instanceof RequestError
      )
        ? new RequestError("fetch-error", error.message)
        : error;
      console.log("HTTP ERROR");
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
