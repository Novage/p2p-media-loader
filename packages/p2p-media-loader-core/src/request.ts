import { Segment, SegmentResponse } from "./types";

type EngineRequest = {
  promise: Promise<SegmentResponse>;
  onSuccess: (response: SegmentResponse) => void;
  onError: (reason?: unknown) => void;
};

type RequestBase = {
  promise: Promise<ArrayBuffer>;
  abort: () => void;
};

export type HttpRequest = RequestBase & {
  type: "http";
};

type P2PRequest = RequestBase & {
  type: "p2p";
};

type HybridLoaderRequest = HttpRequest | P2PRequest;

type Request = {
  segment: Readonly<Segment>;
  loaderRequest?: Readonly<HybridLoaderRequest>;
  engineRequest?: Readonly<EngineRequest>;
};

function isHybridLoaderRequest(
  request: HybridLoaderRequest | EngineRequest
): request is HybridLoaderRequest {
  return !!(request as HybridLoaderRequest).type;
}

export class RequestContainer {
  private readonly requests = new Map<string, Request>();

  addHybridLoaderRequest(segment: Segment, loaderRequest: HybridLoaderRequest) {
    const segmentId = segment.localId;
    const existingRequest = this.requests.get(segmentId);
    if (existingRequest) {
      existingRequest.loaderRequest = loaderRequest;
    } else {
      this.requests.set(segmentId, {
        segment,
        loaderRequest,
      });
    }
    loaderRequest.promise.finally(() => this.requests.delete(segmentId));
  }

  addPlayerRequest(segment: Segment, engineRequest: EngineRequest) {
    const segmentId = segment.localId;
    const existingRequest = this.requests.get(segmentId);
    if (existingRequest) {
      existingRequest.engineRequest = engineRequest;
    } else {
      this.requests.set(segmentId, {
        segment,
        engineRequest,
      });
    }
    engineRequest.promise.finally(() => this.requests.delete(segmentId));
  }

  get(segmentId: string) {
    return this.requests.get(segmentId);
  }

  values() {
    return this.requests.values();
  }

  *httpRequests(): Generator<Request, void> {
    for (const request of this.requests.values()) {
      if (request.loaderRequest?.type === "http") yield request;
    }
  }

  resolveEngineRequest(segmentId: string, response: SegmentResponse) {
    this.requests.get(segmentId)?.engineRequest?.onSuccess(response);
  }

  isRequestedByEngine(segmentId: string): boolean {
    return !!this.requests.get(segmentId)?.engineRequest;
  }

  isHttpRequested(segmentId: string): boolean {
    return this.requests.get(segmentId)?.loaderRequest?.type === "http";
  }

  countHttpRequests(): number {
    let count = 0;
    for (const request of this.requests.values()) {
      if (request.loaderRequest?.type === "http") count++;
    }

    return count;
  }

  abort(segmentId: string) {
    const request = this.requests.get(segmentId);
    if (!request) return;

    request.engineRequest?.onError(new Error("Aborted"));
    request.loaderRequest?.abort();
  }

  abortNotRequestedByEngine(isLocked: (segmentId: string) => boolean) {
    for (const {
      loaderRequest,
      engineRequest,
      segment,
    } of this.requests.values()) {
      if (!engineRequest) continue;
      if (!isLocked(segment.localId) && loaderRequest) loaderRequest.abort();
    }
  }

  destroy() {
    for (const request of this.requests.values()) {
      request.loaderRequest?.abort();
      request.engineRequest?.onError();
    }
    this.requests.clear();
  }
}
