import { Segment, SegmentResponse, StreamType } from "./types";
import { Subscriptions } from "./segments-storage";
import { PeerRequestError } from "./p2p/peer";
import { HttpLoaderError } from "./http-loader";
import Debug from "debug";

export type EngineCallbacks = {
  onSuccess: (response: SegmentResponse) => void;
  onError: (reason: "failed" | "abort") => void;
};

export type LoadProgress = {
  startTimestamp: number;
  lastLoadedChunkTimestamp?: number;
  loadedBytes: number;
  totalBytes?: number;
  chunks: Uint8Array[];
};

type HybridLoaderRequestBase = {
  promise: Promise<ArrayBuffer>;
  abort: () => void;
  progress: LoadProgress;
};

export type HttpRequest = HybridLoaderRequestBase & {
  type: "http";
  error?: HttpLoaderError;
};

export type P2PRequest = HybridLoaderRequestBase & {
  type: "p2p";
  error?: PeerRequestError;
};

export type HybridLoaderRequest = HttpRequest | P2PRequest;

type RequestItem = {
  segment: Readonly<Segment>;
  loaderRequest?: HybridLoaderRequest;
  engineCallbacks?: Readonly<EngineCallbacks>;
  prevAttempts: HybridLoaderRequest[];
};

function getRequestItemId(segment: Segment) {
  return segment.localId;
}

export class RequestsContainer {
  private readonly requests = new Map<string, RequestItem>();
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
    return this.requests.get(id);
  }

  getHybridLoaderRequest(segment: Segment) {
    const id = getRequestItemId(segment);
    return this.requests.get(id)?.loaderRequest;
  }

  remove(segment: Segment) {
    const id = getRequestItemId(segment);
    this.requests.delete(id);
  }

  addHybridLoaderRequest(segment: Segment, loaderRequest: HybridLoaderRequest) {
    const segmentId = getRequestItemId(segment);
    const existingRequest = this.requests.get(segmentId);
    if (existingRequest) {
      existingRequest.loaderRequest = loaderRequest;
    } else {
      this.requests.set(segmentId, {
        segment,
        loaderRequest,
        prevAttempts: [],
      });
    }
    this.logger(
      `add loader request: ${loaderRequest.type} ${segment.externalId}`
    );
    if (loaderRequest.type === "http") this.onHttpRequestsHandlers.fire();
  }

  addEngineCallbacks(segment: Segment, engineCallbacks: EngineCallbacks) {
    const segmentId = getRequestItemId(segment);
    const requestItem = this.requests.get(segmentId);

    if (requestItem) {
      requestItem.engineCallbacks = engineCallbacks;
    } else {
      this.requests.set(segmentId, {
        segment,
        engineCallbacks,
        prevAttempts: [],
      });
    }
    this.logger(`add engine request ${segment.externalId}`);
  }

  values() {
    return this.requests.values();
  }

  *httpRequests(): Generator<RequestItem, void> {
    for (const request of this.requests.values()) {
      if (request.loaderRequest?.type === "http") yield request;
    }
  }

  *p2pRequests(): Generator<RequestItem, void> {
    for (const request of this.requests.values()) {
      if (request.loaderRequest?.type === "p2p") yield request;
    }
  }

  resolveAndRemoveRequest(segment: Segment, response: SegmentResponse) {
    const id = getRequestItemId(segment);
    const request = this.requests.get(id);
    if (!request) return;
    request.engineCallbacks?.onSuccess(response);
    this.requests.delete(id);
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

    // request.engineCallbacks?.onError(new RequestAbortError());
    request.loaderRequest?.abort();
  }

  abortLoaderRequest(segment: Segment) {
    const id = getRequestItemId(segment);
    this.requests.get(id)?.loaderRequest?.abort();
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
      request.engineCallbacks?.onError("failed");
    }
    this.requests.clear();
  }
}
