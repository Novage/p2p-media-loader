import { BandwidthCalculators, SegmentWithStream } from "../internal-types.js";
import { CoreEventMap } from "../types.js";
import { EventTarget } from "../utils/event-target.js";
import { Request } from "./request.js";

export class RequestsContainer {
  private readonly requests = new Map<SegmentWithStream, Request>();

  constructor(
    private readonly requestProcessQueueCallback: () => void,
    private readonly bandwidthCalculators: BandwidthCalculators,
    private readonly eventTarget: EventTarget<CoreEventMap>,
  ) {}

  get executingHttpCount() {
    let count = 0;
    for (const request of this.requests.values()) {
      if (isHttpDownloadUnderWay(request)) count++;
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

  get(segment: SegmentWithStream) {
    return this.requests.get(segment);
  }

  getOrCreateRequest(segment: SegmentWithStream) {
    let request = this.requests.get(segment);
    if (!request) {
      request = new Request(
        segment,
        this.requestProcessQueueCallback,
        this.bandwidthCalculators,
        this.eventTarget,
        segment.stream.infoHash,
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

  /** The HTTP downloads under way (`isHttpDownloadUnderWay`). */
  *loadingHttpRequests(): Generator<Request, void> {
    for (const request of this.requests.values()) {
      if (isHttpDownloadUnderWay(request)) yield request;
    }
  }

  *p2pRequests(): Generator<Request, void> {
    for (const request of this.requests.values()) {
      if (request.downloadSource === "p2p") yield request;
    }
  }

  destroy() {
    for (const request of this.requests.values()) {
      request.endKept("destroyed");
      if (request.status !== "loading") continue;
      request.cancel();
    }
    this.requests.clear();
  }
}

/**
 * An HTTP download under way: what slots, announcements and the yield count
 * as one. A request keeps its source after its attempt ends.
 */
function isHttpDownloadUnderWay(request: Request): boolean {
  return request.downloadSource === "http" && request.status === "loading";
}
