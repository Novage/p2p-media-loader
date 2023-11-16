import { Segment, StreamType } from "./types";
import Debug from "debug";
import { BandwidthApproximator } from "./bandwidth-approximator";
import { Request, RequestEvents } from "./request";

export class RequestsContainer {
  private readonly requests = new Map<Segment, Request>();
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
    return this.requests.get(segment);
  }

  getOrCreateRequest(segment: Segment) {
    let request = this.requests.get(segment);
    if (!request) {
      request = new Request(segment, this.bandwidthApproximator);
      request.subscribe("onSuccess", this.onRequestCompleted);
      this.requests.set(segment, request);
    }
    return request;
  }

  private onRequestCompleted: RequestEvents["onSuccess"] = (request) => {
    this.requests.delete(request.segment);
  };

  remove(segment: Segment) {
    this.requests.delete(segment);
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
    return this.requests.get(segment)?.type === "http";
  }

  isP2PRequested(segment: Segment): boolean {
    return this.requests.get(segment)?.type === "p2p";
  }

  isHybridLoaderRequested(segment: Segment): boolean {
    return !!this.requests.get(segment)?.type;
  }

  destroy() {
    for (const request of this.requests.values()) {
      request.abort();
      request.abortEngineRequest();
    }
    this.requests.clear();
  }
}
