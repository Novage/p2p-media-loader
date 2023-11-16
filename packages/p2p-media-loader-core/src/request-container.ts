import { Segment, StreamType } from "./types";
import Debug from "debug";
import { BandwidthApproximator } from "./bandwidth-approximator";
import { Request, RequestEvents } from "./request";

export class RequestsContainer {
  private readonly requests = new Map<string, Request>();
  private readonly logger: Debug.Debugger;

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
    const id = Request.getRequestItemId(segment);
    return this.requests.get(id);
  }

  getOrCreateRequest(segment: Segment) {
    const id = Request.getRequestItemId(segment);
    let request = this.requests.get(id);
    if (!request) {
      request = new Request(segment, this.bandwidthApproximator);
      request.subscribe("onSuccess", this.onRequestCompleted);
      this.requests.set(request.id, request);
    }
    return request;
  }

  private onRequestCompleted: RequestEvents["onSuccess"] = (request) => {
    this.requests.delete(request.id);
  };

  remove(value: Segment | Request) {
    const id =
      value instanceof Request ? value.id : Request.getRequestItemId(value);
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
    const id = Request.getRequestItemId(segment);
    return this.requests.get(id)?.type === "http";
  }

  isP2PRequested(segment: Segment): boolean {
    const id = Request.getRequestItemId(segment);
    return this.requests.get(id)?.type === "p2p";
  }

  isHybridLoaderRequested(segment: Segment): boolean {
    const id = Request.getRequestItemId(segment);
    return !!this.requests.get(id)?.type;
  }

  destroy() {
    for (const request of this.requests.values()) {
      request.abort();
      request.abortEngineRequest();
    }
    this.requests.clear();
  }
}
