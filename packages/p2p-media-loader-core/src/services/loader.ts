import { Segment, Stream, SegmentResponse } from "../types";
import { getStreamExternalId } from "./utils";
import { FetchError } from "./errors";

export class Loader {
  private manifestResponseUrl?: string;
  private readonly streams: Map<string, Stream>;
  private readonly segmentRequestContext = new Map<string, RequestContext>();

  constructor(streams: Map<string, Stream>) {
    this.streams = streams;
  }

  setManifestResponseUrl(url: string) {
    this.manifestResponseUrl = url;
  }

  async loadSegment(segmentId: string): Promise<SegmentResponse> {
    const segment = this.identifySegment(segmentId);

    const [response, duration] = await trackTime(() =>
      this.fetchSegment(segment)
    );
    const { data, url, ok, status } = response;
    const bits = data.byteLength * 8;

    return {
      url,
      data,
      bandwidth: bits / duration,
      status,
      ok,
    };
  }

  abortSegment(segmentId: string) {
    const requestContext = this.segmentRequestContext.get(segmentId);
    if (!requestContext) return;
    requestContext.abortController.abort();
  }

  private identifySegment(segmentId: string) {
    if (!this.manifestResponseUrl) {
      throw new Error("Manifest response url is undefined");
    }

    const stream = this.streams.get(segmentId);
    const segment = stream?.segments.get(segmentId);
    if (!segment || !stream || !this.manifestResponseUrl) {
      throw new Error(`Not found segment with id: ${segmentId}`);
    }

    console.log("\nloading segment:");
    console.log("Index: ", segment.externalId);
    const streamGlobalId = getStreamExternalId(
      stream,
      this.manifestResponseUrl
    );
    console.log("Stream: ", streamGlobalId);

    return segment;
  }

  private async fetchSegment(segment: Segment) {
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
}

type RequestContext = {
  abortController: AbortController;
};

async function trackTime<T>(
  action: () => T,
  unit: "s" | "ms" = "s"
): Promise<[Awaited<T>, number]> {
  const start = performance.now();
  const result = await action();
  const duration = performance.now() - start;
  return [result, unit === "s" ? duration / 1000 : duration];
}
