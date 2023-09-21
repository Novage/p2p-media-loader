import { Segment, SegmentResponse } from "./types";
import { RequestAbortError } from "./errors";

export type EngineCallbacks = {
  onSuccess: (response: SegmentResponse) => void;
  onError: (reason?: unknown) => void;
};

export type LoadProgress = {
  percent: number;
  loadedBytes: number;
  totalBytes: number;
};

type RequestBase = {
  promise: Promise<ArrayBuffer>;
  abort: () => void;
  progress?: LoadProgress;
  startTimestamp: number;
};

export type HttpRequest = RequestBase & {
  type: "http";
};

export type P2PRequest = RequestBase & {
  type: "p2p";
};

type HybridLoaderRequest = HttpRequest | P2PRequest;

type Request = {
  segment: Readonly<Segment>;
  loaderRequest?: Readonly<HybridLoaderRequest>;
  engineCallbacks?: Readonly<EngineCallbacks>;
};

function getRequestItemId(segment: Segment) {
  return segment.localId;
}

export class RequestContainer {
  private readonly requests = new Map<string, Request>();

  addLoaderRequest(segment: Segment, loaderRequest: HybridLoaderRequest) {
    const segmentId = getRequestItemId(segment);
    const existingRequest = this.requests.get(segmentId);
    if (existingRequest) {
      existingRequest.loaderRequest = loaderRequest;
    } else {
      this.requests.set(segmentId, {
        segment,
        loaderRequest,
      });
    }
    loaderRequest.promise.then(() =>
      this.clearRequestItem(segmentId, "loader")
    );
  }

  addEngineCallbacks(segment: Segment, engineCallbacks: EngineCallbacks) {
    const segmentId = getRequestItemId(segment);
    const requestItem = this.requests.get(segmentId);
    if (requestItem) {
      requestItem.engineCallbacks = engineCallbacks;
    } else {
      engineCallbacks.onSuccess = (response) => {
        this.clearRequestItem(segmentId, "engine");
        return response;
      };
      this.requests.set(segmentId, {
        segment,
        engineCallbacks,
      });
    }
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
    this.requests.get(segmentId)?.engineCallbacks?.onSuccess(response);
  }

  isRequestedByEngine(segmentId: string): boolean {
    return !!this.requests.get(segmentId)?.engineCallbacks;
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

  abortEngineRequest(segmentId: string) {
    const request = this.requests.get(segmentId);
    if (!request) return;

    request.engineCallbacks?.onError(new RequestAbortError());
  }

  abortLoaderRequest(segmentId: string) {
    const request = this.requests.get(segmentId);
    if (!request) return;

    if (request.loaderRequest) {
      request.loaderRequest.abort();
      request.engineCallbacks?.onError(new RequestAbortError());
    }
  }

  private clearRequestItem(
    requestItemId: string,
    type: "loader" | "engine"
  ): void {
    const requestItem = this.requests.get(requestItemId);
    if (!requestItem) return;

    if (type === "engine") delete requestItem.engineCallbacks;
    if (type === "loader") delete requestItem.loaderRequest;
    if (!requestItem.engineCallbacks && !requestItem.loaderRequest) {
      const segmentId = getRequestItemId(requestItem.segment);
      this.requests.delete(segmentId);
    }
  }

  abortAllNotRequestedByEngine(isLocked?: (segmentId: string) => boolean) {
    for (const {
      loaderRequest,
      engineCallbacks,
      segment,
    } of this.requests.values()) {
      if (!engineCallbacks) continue;
      const segmentId = getRequestItemId(segment);
      if ((!isLocked || !isLocked(segmentId)) && loaderRequest) {
        loaderRequest.abort();
      }
    }
  }

  destroy() {
    for (const request of this.requests.values()) {
      request.loaderRequest?.abort();
      request.engineCallbacks?.onError();
    }
    this.requests.clear();
  }
}
