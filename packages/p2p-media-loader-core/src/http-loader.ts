import { AbortError, FetchError } from "./errors";
import { Segment } from "./types";
import { HttpRequest } from "./request";

export function loadSegmentThroughHttp(
  segment: Segment
): Readonly<HttpRequest> {
  const { promise, abortController } = fetchSegment(segment);
  return {
    type: "http",
    promise,
    abort: () => abortController.abort(),
  };
}

function fetchSegment(segment: Segment) {
  const headers = new Headers();
  const { url, byteRange, localId: segmentId } = segment;

  if (byteRange) {
    const { start, end } = byteRange;
    const byteRangeString = `bytes=${start}-${end}`;
    headers.set("Range", byteRangeString);
  }
  const abortController = new AbortController();

  const promise = fetch(url, {
    headers,
    signal: abortController.signal,
  })
    .then((response) => {
      if (response.ok) return response.arrayBuffer();

      throw new FetchError(
        response.statusText ?? `Network response was not for ${segmentId}`,
        response.status,
        response
      );
    })
    .catch((error) => {
      if (error instanceof Error && error.name === "AbortError") {
        throw new AbortError(`Segment fetch was aborted ${segmentId}`);
      }
      throw error;
    });

  return { promise, abortController };
}
