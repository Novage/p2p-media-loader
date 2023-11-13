import { Segment, SegmentResponse, StreamType } from "./types";
import { PeerRequestError } from "./p2p/peer";
import { HttpLoaderError } from "./http-loader";
import Debug from "debug";
import { EventDispatcher } from "./event-dispatcher";
import * as Utils from "./utils/utils";
import { BandwidthApproximator } from "./bandwidth-approximator";

export type EngineCallbacks = {
  onSuccess: (response: SegmentResponse) => void;
  onError: (reason: "failed" | "abort") => void;
};

export type LoadProgress = {
  startTimestamp: number;
  lastLoadedChunkTimestamp?: number;
  loadedBytes: number;
  totalBytes?: number;
};

type HybridLoaderRequestBase = {
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

type RequestEvents = {
  onCompleted: (request: Request, data: ArrayBuffer) => void;
  onError: (request: Request, data: Error) => void;
};

type RequestStatus =
  | "not-started"
  | "loading"
  | "succeed"
  | "failed"
  | "aborted";

export class Request extends EventDispatcher<RequestEvents> {
  readonly id: string;
  private _engineCallbacks?: EngineCallbacks;
  private hybridLoaderRequest?: HybridLoaderRequest;
  private prevAttempts: HybridLoaderRequest[] = [];
  private chunks: Uint8Array[] = [];
  private _loadedBytes = 0;
  private _totalBytes?: number;
  private _status: RequestStatus = "not-started";

  constructor(
    readonly segment: Segment,
    private readonly bandwidthApproximator: BandwidthApproximator
  ) {
    super();
    this.id = getRequestItemId(segment);
  }

  get status() {
    return this._status;
  }

  get isSegmentRequestedByEngine(): boolean {
    return !!this._engineCallbacks;
  }

  get type() {
    return this.hybridLoaderRequest?.type;
  }

  get loadedBytes() {
    return this._loadedBytes;
  }

  set engineCallbacks(callbacks: EngineCallbacks) {
    if (this._engineCallbacks) {
      throw new Error("Segment is already requested by engine");
    }
    this._engineCallbacks = callbacks;
  }

  get totalBytes(): number | undefined {
    return this._totalBytes;
  }

  setTotalBytes(value: number) {
    if (this._totalBytes !== undefined) {
      throw new Error("Request total bytes value is already set");
    }
    this._totalBytes = value;
  }

  get loadedPercent() {
    if (!this._totalBytes) return;
    return Utils.getPercent(this.loadedBytes, this._totalBytes);
  }

  start(type: "http" | "p2p", abortLoading: () => void): RequestControls {
    if (this._status === "loading") {
      throw new Error("Request has been already started.");
    }

    this._status = "loading";
    this.hybridLoaderRequest = {
      type,
      abort: abortLoading,
      progress: {
        loadedBytes: 0,
        startTimestamp: performance.now(),
      },
    };

    return {
      addLoadedChunk: this.addLoadedChunk,
      completeOnSuccess: this.completeOnSuccess,
      cancelOnError: this.cancelOnError,
    };
  }

  abort() {
    if (!this.hybridLoaderRequest) return;
    this.hybridLoaderRequest.abort();
    this._status = "aborted";
  }

  private completeOnSuccess = () => {
    this.throwErrorIfNotLoadingStatus();
    const data = Utils.joinChunks(this.chunks);
    this._status = "succeed";
    this._engineCallbacks?.onSuccess({
      data,
      bandwidth: this.bandwidthApproximator.getBandwidth(),
    });
    this.dispatch("onCompleted", this, data);
  };

  private addLoadedChunk = (chunk: Uint8Array) => {
    this.throwErrorIfNotLoadingStatus();
    const { hybridLoaderRequest: request } = this;
    if (!request) return;
    this.chunks.push(chunk);
    request.progress.lastLoadedChunkTimestamp = performance.now();
    this._loadedBytes += chunk.length;
  };

  private cancelOnError = (error: Error) => {
    this.throwErrorIfNotLoadingStatus();
    if (!this.hybridLoaderRequest) return;
    this._status = "failed";
    this.hybridLoaderRequest.error = error;
    this.prevAttempts.push(this.hybridLoaderRequest);
    this.dispatch("onError", this, error);
  };

  private throwErrorIfNotLoadingStatus() {
    if (this._status !== "loading") {
      throw new Error("Request has been already completed/aborted/failed.");
    }
  }
}

export type RequestControls = {
  addLoadedChunk: Request["addLoadedChunk"];
  completeOnSuccess: Request["completeOnSuccess"];
  cancelOnError: Request["cancelOnError"];
};

function getRequestItemId(segment: Segment) {
  return segment.localId;
}

type RequestsContainerEvents = {
  httpRequestsUpdated: () => void;
};

export class RequestsContainer {
  private readonly requests = new Map<string, Request>();
  private readonly logger: Debug.Debugger;
  private readonly events = new EventDispatcher<RequestsContainerEvents>();

  constructor(
    streamType: StreamType,
    private readonly bandwidthApproximator: BandwidthApproximator
  ) {
    this.logger = Debug(`core:requests-container-${streamType}`);
    this.logger.color = "LightSeaGreen";
  }

  get executingHttpCount() {
    let count = 0;
    for (const request of this.httpRequests()) {
      if (request.status === "loading") count++;
    }
    return count;
  }

  get executingP2PCount() {
    let count = 0;
    for (const request of this.p2pRequests()) {
      if (request.status === "loading") count++;
    }
    return count;
  }

  get(segment: Segment) {
    const id = getRequestItemId(segment);
    return this.requests.get(id);
  }

  getOrCreateRequest(segment: Segment) {
    const id = getRequestItemId(segment);
    let request = this.requests.get(id);
    if (!request) {
      request = new Request(segment, this.bandwidthApproximator);
      request.subscribe("onCompleted", this.onRequestCompleted);
      this.requests.set(request.id, request);
    }
    return request;
  }

  private onRequestCompleted: RequestEvents["onCompleted"] = (request) => {
    this.requests.delete(request.id);
  };

  remove(value: Segment | Request) {
    const id = value instanceof Request ? value.id : getRequestItemId(value);
    this.requests.delete(id);
  }

  values() {
    return this.requests.values();
  }

  *httpRequests(): Generator<Request, void> {
    for (const request of this.requests.values()) {
      if (request.type === "http") yield request;
    }
  }

  *p2pRequests(): Generator<Request, void> {
    for (const request of this.requests.values()) {
      if (request.type === "p2p") yield request;
    }
  }

  isHttpRequested(segment: Segment): boolean {
    const id = getRequestItemId(segment);
    return this.requests.get(id)?.type === "http";
  }

  isP2PRequested(segment: Segment): boolean {
    const id = getRequestItemId(segment);
    return this.requests.get(id)?.type === "p2p";
  }

  isHybridLoaderRequested(segment: Segment): boolean {
    const id = getRequestItemId(segment);
    return !!this.requests.get(id)?.type;
  }

  destroy() {
    for (const request of this.requests.values()) {
      request.abort();
      request.engineCallbacks?.onError("failed");
    }
    this.requests.clear();
  }
}
