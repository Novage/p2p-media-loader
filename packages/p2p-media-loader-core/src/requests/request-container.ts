import {
  Segment,
  Settings,
  Playback,
  BandwidthCalculators,
  CoreEventMap,
} from "../types";
import { EventEmitter } from "../utils/event-emitter";
import { Request } from "./request";

export class RequestsContainer {
  private readonly requests = new Map<Segment, Request>();

  constructor(
    private readonly requestProcessQueueCallback: () => void,
    private readonly bandwidthCalculators: BandwidthCalculators,
    private readonly playback: Playback,
    private readonly settings: Settings,
    private readonly eventEmmiter: EventEmitter<CoreEventMap>,
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

  getOrCreateRequest(segment: Segment) {
    let request = this.requests.get(segment);
    if (!request) {
      request = new Request(
        segment,
        this.requestProcessQueueCallback,
        this.bandwidthCalculators,
        this.playback,
        this.settings,
        this.eventEmmiter,
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
      if (request.downloadSource === "http") yield request;
    }
  }

  *p2pRequests(): Generator<Request, void> {
    for (const request of this.requests.values()) {
      if (request.downloadSource === "p2p") yield request;
    }
  }

  destroy() {
    for (const request of this.requests.values()) {
      request.abortFromProcessQueue();
    }
    this.requests.clear();
  }
}
