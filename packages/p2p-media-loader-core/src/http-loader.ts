import { Segment } from "./types";
import { FetchError } from "./errors";

type RequestContext = {
  abortController: AbortController;
};

export class HttpLoader {
  private readonly segmentRequestContext = new Map<string, RequestContext>();

  async load(segment: Segment) {
    const headers = new Headers();
    const { url, byteRange } = segment;

    if (byteRange) {
      const { start, end } = byteRange;
      const byteRangeString = `bytes=${start}-${end}`;
      headers.set("Range", byteRangeString);
    }
    const requestContext: RequestContext = {
      abortController: new AbortController(),
    };
    this.segmentRequestContext.set(segment.localId, requestContext);
    const response = await fetch(url, {
      headers,
      signal: requestContext.abortController.signal,
    });
    if (!response.ok) {
      throw new FetchError(
        response.statusText ?? "Fetch, bad network response",
        response.status,
        response
      );
    }
    const data = await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status,
      data,
      url: response.url,
    };
  }

  abort(segmentId: string) {
    this.segmentRequestContext.get(segmentId)?.abortController.abort();
  }
}
