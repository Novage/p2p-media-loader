import { Settings } from "./types";
import { Request, RequestError, HttpRequestErrorType } from "./request";

export async function fulfillHttpSegmentRequest(
  request: Request,
  settings: Pick<Settings, "httpNotReceivingBytesTimeoutMs">
) {
  const requestHeaders = new Headers();
  const { segment, loadedBytes: alreadyLoadedBytes } = request;
  const { url, byteRange } = segment;

  let byteFrom = byteRange?.start;
  const byteTo = byteRange?.end;
  if (alreadyLoadedBytes !== 0) byteFrom = (byteFrom ?? 0) + alreadyLoadedBytes;

  if (byteFrom !== undefined) {
    const byteRangeString = `bytes=${byteFrom}-${byteTo ?? ""}`;
    requestHeaders.set("Range", byteRangeString);
  }

  const abortController = new AbortController();
  const requestControls = request.start(
    { type: "http" },
    {
      abort: () => abortController.abort("abort"),
      notReceivingBytesTimeoutMs: settings.httpNotReceivingBytesTimeoutMs,
    }
  );
  try {
    const fetchResponse = await window.fetch(url, {
      headers: requestHeaders,
      signal: abortController.signal,
    });
    if (!fetchResponse.ok) {
      throw new RequestError("fetch-error", fetchResponse.statusText);
    }
    if (!fetchResponse.body) return;
    requestControls.firstBytesReceived();

    if (
      byteFrom !== undefined &&
      (fetchResponse.status !== 206 ||
        !isResponseWithRequestedContentRange(fetchResponse, byteFrom, byteTo))
    ) {
      request.clearLoadedBytes();
    }

    if (request.totalBytes === undefined) {
      const totalBytesString = fetchResponse.headers.get("Content-Length");
      if (totalBytesString) request.setTotalBytes(+totalBytesString);
    }

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
      requestControls.abortOnError(httpLoaderError);
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

function getValueFromContentRangeHeader(headerValue: string) {
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

function isResponseWithRequestedContentRange(
  response: Response,
  requestedFromByte: number,
  requestedToByte?: number
): boolean {
  const requestedBytesAmount =
    requestedToByte !== undefined
      ? requestedToByte - requestedFromByte + 1
      : undefined;

  const { headers } = response;
  const contentLengthHeader = headers.get("Content-Length");
  const contentLength = contentLengthHeader && parseInt(contentLengthHeader);

  if (
    contentLength &&
    requestedBytesAmount !== undefined &&
    requestedBytesAmount !== contentLength
  ) {
    return false;
  }

  const contentRangeHeader = headers.get("Content-Range");
  const contentRange =
    contentRangeHeader && getValueFromContentRangeHeader(contentRangeHeader);
  if (!contentRange) return true;
  const { from, to } = contentRange;
  if (from !== requestedFromByte) return false;
  if (
    to !== undefined &&
    requestedToByte !== undefined &&
    to !== requestedToByte
  ) {
    return false;
  }
  return true;
}
