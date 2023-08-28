import { Segment, StreamWithSegments } from "./types";
import { LinkedMap } from "./linked-map";
import { Playback } from "./playback";
import * as Utils from "./utils";
import { SegmentsMemoryStorage } from "./segments-storage";

export class LoadQueue {
  private activeStream?: StreamWithSegments;
  private readonly highDemandQueue = new LinkedMap<string, SegmentRequest>();
  private readonly lowDemandQueue = new LinkedMap<string, SegmentRequest>();

  constructor(
    private readonly streams: Map<string, StreamWithSegments>,
    private readonly playback: Playback,
    private readonly segmentStorage: SegmentsMemoryStorage
  ) {}

  getRequestById(id: string) {
    return this.highDemandQueue.get(id) ?? this.lowDemandQueue.get(id);
  }

  getNextForLoading() {
    if (this.highDemandQueue.size) {
      for (const [, request] of this.highDemandQueue.entries()) {
        if (request.status === "not-started") return request;
      }
    }
    if (this.lowDemandQueue.size) {
      const randomIndex = getRandomInt(0, this.lowDemandQueue.size);
      let i = 0;
      for (const [, request] of this.lowDemandQueue.entries()) {
        if (i === randomIndex) return request;
        i++;
      }
    }
  }

  requestByPlayer(segmentId: string) {
    const { stream, segment: requestedSegment } =
      Utils.getSegmentFromStreamsMap(this.streams, segmentId) ?? {};
    if (!stream || !requestedSegment) return;

    if (this.activeStream !== stream) {
      this.activeStream = stream;
      this.abortAndClear();
    }

    this.addRequests(requestedSegment);
  }

  private addRequests(requestedSegment: Segment) {
    if (!this.activeStream) return;

    const highDemandAddToStart: [string, SegmentRequest][] = [];
    const lowDemandAddToStart: [string, SegmentRequest][] = [];
    for (const [segmentId, segment] of this.activeStream.segments.entries(
      requestedSegment.localId
    )) {
      const status = this.getSegmentStatus(segment);
      if (
        status === "not-actual" ||
        this.highDemandQueue.has(segmentId) ||
        this.lowDemandQueue.has(segmentId)
      ) {
        break;
      }
      if (this.isSegmentAlreadyLoaded(segmentId)) continue;

      const request = this.createSegmentRequest(segment);
      if (status === "high-demand") {
        highDemandAddToStart.push([segmentId, request]);
      } else if (status === "low-demand") {
        lowDemandAddToStart.push([segmentId, request]);
      }
    }
    this.highDemandQueue.addListToStart(highDemandAddToStart);
    this.lowDemandQueue.addListToStart(lowDemandAddToStart);

    let queue: LinkedMap<string, SegmentRequest> | undefined;
    if (this.lowDemandQueue.last) queue = this.lowDemandQueue;
    else if (this.highDemandQueue.last) queue = this.highDemandQueue;
    if (!queue) return;

    for (const [segmentId, segment] of this.activeStream.segments.entries(
      queue.last?.[0]
    )) {
      const status = this.getSegmentStatus(segment);
      if (status === "not-actual") break;
      if (queue.has(segmentId) || this.isSegmentAlreadyLoaded(segmentId)) {
        continue;
      }

      const request = this.createSegmentRequest(segment);
      queue.addToEnd(segmentId, request);
    }
  }

  removeNotInLoadTimeRange() {
    if (!this.activeStream) return;

    // remove not actual requests (if exist) from high demand queue start
    for (const [, request] of this.highDemandQueue.entries()) {
      const { segment } = request;
      const status = this.getSegmentStatus(segment);
      if (status === "high-demand") break;

      request.abort();
      this.lowDemandQueue.delete(segment.localId);
    }

    // remove not actual requests (if exist) from low demand queue end
    for (const [, request] of this.lowDemandQueue.valuesBackwards()) {
      const { segment } = request;
      const status = this.getSegmentStatus(segment);
      if (status === "low-demand") break;

      request.abort();
      this.lowDemandQueue.delete(segment.localId);
    }

    // move low demand requests (if exist) from high demand queue
    for (const [, request] of this.highDemandQueue.valuesBackwards()) {
      const { segment } = request;
      const status = this.getSegmentStatus(segment);
      if (status === "high-demand") break;

      if (status === "low-demand") {
        this.lowDemandQueue.addToStart(segment.localId, request);
      }
      this.lowDemandQueue.delete(segment.localId);
    }

    // move high demand requests (if exist) from low demand queue
    for (const [, request] of this.lowDemandQueue.entries()) {
      const { segment } = request;
      const status = this.getSegmentStatus(segment);
      if (status === "low-demand") break;

      if (status === "high-demand") {
        this.highDemandQueue.addToEnd(segment.localId, request);
      }
      this.lowDemandQueue.delete(segment.localId);
    }
  }

  private abortAndClear() {
    this.highDemandQueue.forEach(([, r]) => r.abort());
    this.lowDemandQueue.forEach(([, r]) => r.abort());
    this.highDemandQueue.clear();
    this.lowDemandQueue.clear();
  }

  private createSegmentRequest(segment: Segment) {
    const request = new SegmentRequest(segment);
    request.setLoadedHandler(() => {
      this.highDemandQueue.delete(segment.localId);
      this.lowDemandQueue.delete(segment.localId);
    });
    return request;
  }

  private getSegmentStatus(segment: Segment) {
    const { position, highDemandMargin, lowDemandMargin } = this.playback;
    const { startTime } = segment;
    if (startTime >= position && startTime < highDemandMargin) {
      return "high-demand";
    }
    if (startTime >= highDemandMargin && startTime < lowDemandMargin) {
      return "low-demand";
    }
    return "not-actual";
  }

  private isSegmentAlreadyLoaded(segmentId: string) {
    return this.segmentStorage.hasSegment(segmentId);
  }

  // refreshQueue() {
  //   if (!this.activeStream) return;
  //
  //   for (const loadedSegmentId of this.loadedSegmentIds) {
  //     if (!this.activeStream.segments.has(loadedSegmentId)) {
  //       this.loadedSegmentIds.delete(loadedSegmentId);
  //     }
  //   }
  //
  //   const last = this.queue[this.queue.length - 1];
  //   for (const segment of this.activeStream.segments.values()) {
  //     if (!this.loadedSegmentIds.has(segment.localId)) this.queue.push(segment);
  //   }
  // }
}

export class SegmentRequest {
  segment: Segment;
  private _status: "not-started" | "pending" | "completed" = "not-started";
  private abortHandler?: () => void;
  private loadedHandler?: () => void;

  constructor(segment: Segment) {
    this.segment = segment;
  }

  get status() {
    return this._status;
  }

  setAbortHandler(handler: () => void) {
    this.abortHandler = handler;
  }

  setLoadedHandler(handler: () => void) {
    this.loadedHandler = handler;
  }

  loaded() {
    this._status = "completed";
    this.loadedHandler?.();
  }

  abort() {
    this.abortHandler?.();
  }
}

function getRandomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
