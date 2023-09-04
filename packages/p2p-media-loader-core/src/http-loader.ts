import { FetchError } from "./errors";
import { Segment } from "./types";

type Request = {
  promise: Promise<ArrayBuffer>;
  abortController: AbortController;
};

export class HttpLoader {
  private readonly requests = new Map<string, Request>();

  async load(segment: Segment) {
    const abortController = new AbortController();
    const promise = this.fetch(segment, abortController);
    const requestContext: Request = {
      abortController,
      promise,
    };
    this.requests.set(segment.localId, requestContext);
    await promise;
    this.requests.delete(segment.localId);
    return promise;
  }

  private async fetch(segment: Segment, abortController: AbortController) {
    const headers = new Headers();
    const { url, byteRange } = segment;

    if (byteRange) {
      const { start, end } = byteRange;
      const byteRangeString = `bytes=${start}-${end}`;
      headers.set("Range", byteRangeString);
    }
    const response = await fetch(url, {
      headers,
      signal: abortController.signal,
    });
    if (!response.ok) {
      throw new FetchError(
        response.statusText ?? "Fetch, bad network response",
        response.status,
        response
      );
    }

    return response.arrayBuffer();
  }

  isLoading(segmentId: string) {
    return this.requests.has(segmentId);
  }

  abort(segmentId: string) {
    this.requests.get(segmentId)?.abortController.abort();
    this.requests.delete(segmentId);
  }

  getLoadingsAmount() {
    return this.requests.size;
  }

  getRequest(segmentId: string) {
    return this.requests.get(segmentId)?.promise;
  }

  abortAll() {
    for (const request of this.requests.values()) {
      request.abortController.abort();
    }
    this.requests.clear();
  }
}
