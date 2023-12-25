import { Segment, Settings, Playback } from "./types";
import { BandwidthCalculator } from "./bandwidth-calculator";
import { Request } from "./request";

export class RequestsContainer {
  private readonly requests = new Map<Segment, Request>();

  constructor(
    private readonly requestProcessQueueCallback: () => void,
    private readonly bandwidthApproximator: BandwidthCalculator,
    private readonly playback: Playback,
    private readonly settings: Settings
  ) {}

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

  getBySegmentLocalId(id: string) {
    for (const request of this.requests.values()) {
      if (request.segment.localId === id) return request;
    }
  }

  getOrCreateRequest(segment: Segment) {
    let request = this.requests.get(segment);
    if (!request) {
      request = new Request(
        segment,
        this.requestProcessQueueCallback,
        this.bandwidthApproximator,
        this.playback,
        this.settings
      );
      this.requests.set(segment, request);
    }
    return request;
  }

  remove(request: Request) {
    this.requests.delete(request.segment);
  }

  items() {
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
  isHybridLoaderRequested(segment: Segment): boolean {
    return !!this.requests.get(segment)?.type;
  }

  destroy() {
    for (const request of this.requests.values()) {
      request.abortFromProcessQueue();
      request.abortFromEngine();
    }
    this.requests.clear();
  }
}
