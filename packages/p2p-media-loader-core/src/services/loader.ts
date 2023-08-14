import { Segment, Stream } from "../types";
import { getStreamGlobalId } from "./utils";

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

  async loadSegment(segmentId: string) {
    // TODO: maybe we should throw error?
    if (!this.manifestResponseUrl) {
      throw new Error("Manifest response url is undefined");
    }

    const stream = this.streams.get(segmentId);
    const segment = stream?.segments.get(segmentId);
    if (!segment || !stream || !this.manifestResponseUrl) {
      throw new Error(`Not found segment with id: ${segmentId}`);
    }

    console.log("\nloading segment:");
    console.log("Index: ", segment.globalId);
    const streamGlobalId = getStreamGlobalId(stream, this.manifestResponseUrl);
    console.log("Stream: ", streamGlobalId);
    return this.fetchSegment(segment);
  }

  abortSegment(segmentId: string) {
    const requestContext = this.segmentRequestContext.get(segmentId);
    if (!requestContext) return;
    requestContext.abortController.abort();
  }

  private async fetchSegment(segment: Segment) {
    const headers = new Headers();
    const { url, byteRange } = segment;

    if (byteRange) {
      const { start, end } = byteRange;
      const byteRangeString = `bytes=${start}-${end}`;
      headers.set("Range", byteRangeString);
    }
    const requestContext = new RequestContext();
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

class RequestContext {
  abortController = new AbortController();
}

export class FetchError extends Error {
  public code: number;
  public details: object;

  constructor(message: string, code: number, details: object) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
