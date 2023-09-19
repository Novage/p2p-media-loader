import { RequestAbortError, FetchError } from "./errors";
import { Segment } from "./types";
import { HttpRequest } from "./request";

export function getHttpSegmentRequest(segment: Segment): Readonly<HttpRequest> {
  const { promise, abortController } = fetchSegmentData(segment);
  return {
    type: "http",
    promise,
    abort: () => abortController.abort(),
  };
}

function fetchSegmentData(segment: Segment) {
  const headers = new Headers();
  const { url, byteRange, localId: segmentId } = segment;

  if (byteRange) {
    const { start, end } = byteRange;
    const byteRangeString = `bytes=${start}-${end}`;
    headers.set("Range", byteRangeString);
  }
  const abortController = new AbortController();

  const loadSegmentData = async () => {
    try {
      const response = await window.fetch(url, {
        headers,
        signal: abortController.signal,
      });

      if (response.ok) return response.arrayBuffer();
      throw new FetchError(
        response.statusText ?? `Network response was not for ${segmentId}`,
        response.status,
        response
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new RequestAbortError(`Segment fetch was aborted ${segmentId}`);
      }
      throw error;
    }
  };

  return { promise: loadSegmentData(), abortController };
}
