import { FetchError } from "./errors";
import { Segment } from "./types";
import { HttpRequest } from "./request";

export function loadSegmentHttp(segment: Segment): Readonly<HttpRequest> {
  const { promise, abortController } = fetchSegment(segment);
  return {
    type: "http",
    promise,
    abort: () => abortController.abort(),
  };
}

function fetchSegment(segment: Segment) {
  const headers = new Headers();
  const { url, byteRange } = segment;

  if (byteRange) {
    const { start, end } = byteRange;
    const byteRangeString = `bytes=${start}-${end}`;
    headers.set("Range", byteRangeString);
  }
  const abortController = new AbortController();

  const promise = fetch(url, {
    headers,
    signal: abortController.signal,
  }).then((response) => {
    if (!response.ok) {
      throw new FetchError(
        response.statusText ?? "Fetch, bad network response",
        response.status,
        response
      );
    }

    return response.arrayBuffer();
  });

  return { promise, abortController };
}
