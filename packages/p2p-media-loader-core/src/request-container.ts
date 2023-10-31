import { Segment, SegmentResponse, StreamType } from "./types";
import { RequestAbortError } from "./errors";
import { Subscriptions } from "./segments-storage";
import Debug from "debug";

export type EngineCallbacks = {
  onSuccess: (response: SegmentResponse) => void;
  onError: (reason?: unknown) => void;
};

export type LoadProgress = {
  startTimestamp: number;
  lastLoadedChunkTimestamp?: number;
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  canBeTracked: boolean;
};

type RequestBase = {
  promise: Promise<ArrayBuffer>;
  abort: () => void;
  progress: LoadProgress;
};

export type HttpRequest = RequestBase & {
  type: "http";
};

export type P2PRequest = RequestBase & {
  type: "p2p";
};

export type HybridLoaderRequest = HttpRequest | P2PRequest;

type Request = {
  segment: Readonly<Segment>;
  loaderRequest?: Readonly<HybridLoaderRequest>;
  engineCallbacks?: Readonly<EngineCallbacks>;
};

function getRequestItemId(segment: Segment) {
  return segment.localId;
}

export class RequestsContainer {
  private readonly requests = new Map<string, Request>();
  private readonly onHttpRequestsHandlers = new Subscriptions();
  private readonly logger: Debug.Debugger;

  constructor(streamType: StreamType) {
    this.logger = Debug(`core:requests-container-${streamType}`);
    this.logger.color = "LightSeaGreen";
  }

  get httpRequestsCount() {
    let count = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const request of this.httpRequests()) count++;
    return count;
  }

  get p2pRequestsCount() {
    let count = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const request of this.p2pRequests()) count++;
    return count;
  }

  get(segment: Segment) {
    const id = getRequestItemId(segment);
    return this.requests.get(id)?.loaderRequest;
  }

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
    this.logger(
      `add loader request: ${loaderRequest.type} ${segment.externalId}`
    );

    const clearRequestItem = () => this.clearRequestItem(segmentId, "loader");
    loaderRequest.promise
      .then(() => clearRequestItem())
      .catch((err) => {
        if (err instanceof RequestAbortError) clearRequestItem();
      });
    if (loaderRequest.type === "http") this.onHttpRequestsHandlers.fire();
  }

  addEngineCallbacks(segment: Segment, engineCallbacks: EngineCallbacks) {
    const segmentId = getRequestItemId(segment);
    const requestItem = this.requests.get(segmentId);

    const { onSuccess, onError } = engineCallbacks;
    engineCallbacks.onSuccess = (response) => {
      this.clearRequestItem(segmentId, "engine");
      return onSuccess(response);
    };

    engineCallbacks.onError = (error) => {
      if (error instanceof RequestAbortError) {
        this.clearRequestItem(segmentId, "engine");
      }
      return onError(error);
    };

    if (requestItem) {
      requestItem.engineCallbacks = engineCallbacks;
    } else {
      this.requests.set(segmentId, {
        segment,
        engineCallbacks,
      });
    }
    this.logger(`add engine request ${segment.externalId}`);
  }

  values() {
    return this.requests.values();
  }

  *httpRequests(): Generator<Request, void> {
    for (const request of this.requests.values()) {
      if (request.loaderRequest?.type === "http") yield request;
    }
  }

  *p2pRequests(): Generator<Request, void> {
    for (const request of this.requests.values()) {
      if (request.loaderRequest?.type === "p2p") yield request;
    }
  }

  resolveEngineRequest(segment: Segment, response: SegmentResponse) {
    const id = getRequestItemId(segment);
    this.requests.get(id)?.engineCallbacks?.onSuccess(response);
  }

  isHttpRequested(segment: Segment): boolean {
    const id = getRequestItemId(segment);
    return this.requests.get(id)?.loaderRequest?.type === "http";
  }

  isP2PRequested(segment: Segment): boolean {
    const id = getRequestItemId(segment);
    return this.requests.get(id)?.loaderRequest?.type === "p2p";
  }

  isHybridLoaderRequested(segment: Segment): boolean {
    const id = getRequestItemId(segment);
    return !!this.requests.get(id)?.loaderRequest;
  }

  abortEngineRequest(segment: Segment) {
    const id = getRequestItemId(segment);
    const request = this.requests.get(id);
    if (!request) return;

    request.engineCallbacks?.onError(new RequestAbortError());
    request.loaderRequest?.abort();
  }

  abortLoaderRequest(segment: Segment) {
    const id = getRequestItemId(segment);
    this.requests.get(id)?.loaderRequest?.abort();
  }

  private clearRequestItem(
    requestItemId: string,
    type: "loader" | "engine"
  ): void {
    const requestItem = this.requests.get(requestItemId);
    if (!requestItem) return;
    const { segment, loaderRequest } = requestItem;
    const segmentExternalId = segment.externalId;

    if (type === "engine") {
      this.logger(`remove engine callbacks: ${segmentExternalId}`);
      delete requestItem.engineCallbacks;
    }
    if (type === "loader" && loaderRequest) {
      this.logger(
        `remove loader request: ${loaderRequest.type} ${segmentExternalId}`
      );
      if (loaderRequest.type === "http") {
        this.onHttpRequestsHandlers.fire();
      }
      delete requestItem.loaderRequest;
    }
    if (!requestItem.engineCallbacks && !requestItem.loaderRequest) {
      this.logger(`remove request item ${segmentExternalId}`);
      const segmentId = getRequestItemId(segment);
      this.requests.delete(segmentId);
    }
  }

  abortAllNotRequestedByEngine(isLocked?: (segment: Segment) => boolean) {
    const isSegmentLocked = isLocked ? isLocked : () => false;
    for (const {
      loaderRequest,
      engineCallbacks,
      segment,
    } of this.requests.values()) {
      if (engineCallbacks || !loaderRequest) continue;
      if (!isSegmentLocked(segment)) loaderRequest.abort();
    }
  }

  subscribeOnHttpRequestsUpdate(handler: () => void) {
    this.onHttpRequestsHandlers.add(handler);
  }

  unsubscribeFromHttpRequestsUpdate(handler: () => void) {
    this.onHttpRequestsHandlers.remove(handler);
  }

  destroy() {
    for (const request of this.requests.values()) {
      request.loaderRequest?.abort();
      request.engineCallbacks?.onError();
    }
    this.requests.clear();
  }
}
