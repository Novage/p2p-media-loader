import { Segment, StreamWithSegments } from "./types";
import { LinkedMap } from "./linked-map";
import { Playback } from "./playback";
import * as Utils from "./utils";

export class LoadQueue {
  private readonly streams: Map<string, StreamWithSegments>;
  private activeStream?: StreamWithSegments;
  private readonly isSegmentLoaded!: (segmentId: string) => boolean;
  private readonly highDemandQueue = new LinkedMap<string, SegmentRequest>();
  private readonly lowDemandQueue = new LinkedMap<string, SegmentRequest>();
  private readonly playback: Playback;

  constructor(streams: Map<string, StreamWithSegments>, playback: Playback) {
    this.streams = streams;
    this.playback = playback;
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

  addRequests(requestedSegment: Segment) {
    if (!this.activeStream) return;

    const highDemandAddToStart: SegmentRequest[] = [];
    const lowDemandAddToStart: SegmentRequest[] = [];
    for (const segment of this.activeStream.segments.values(
      requestedSegment.localId
    )) {
      const status = this.getSegmentStatus(segment);

      if (
        status === "not-actual" ||
        this.highDemandQueue.has(segment.localId) ||
        this.lowDemandQueue.has(segment.localId)
      ) {
        break;
      }
      if (this.isSegmentLoaded(segment.localId)) continue;

      const request = this.createSegmentRequest(segment);
      if (status === "high-demand") {
        highDemandAddToStart.push(request);
      } else if (status === "low-demand") {
        lowDemandAddToStart.push(request);
      }
    }

    const lowDemandLast = this.lowDemandQueue.last?.segment;
    if (!lowDemandLast) return;

    for (const segment of this.activeStream.segments.values(
      lowDemandLast.localId
    )) {
      const status = this.getSegmentStatus(segment);
      if (status === "not-actual") break;

      const request = this.createSegmentRequest(segment);
      this.lowDemandQueue.addToEnd(segment.localId, request);
    }
  }

  onPlaybackUpdate() {
    if (!this.activeStream) return;

    // remove not actual values (if exist) from high demand queue start
    for (const request of this.highDemandQueue.values()) {
      const { segment } = request;
      const status = this.getSegmentStatus(segment);
      if (status === "high-demand") break;

      request.abort();
      this.lowDemandQueue.delete(segment.localId);
    }

    // remove not actual values (if exist) from low demand queue end
    for (const request of this.lowDemandQueue.valuesBackwards()) {
      const { segment } = request;
      const status = this.getSegmentStatus(segment);
      if (status === "low-demand") break;

      request.abort();
      this.lowDemandQueue.delete(segment.localId);
    }

    // move low demand values (if exist) from high demand queue
    for (const request of this.highDemandQueue.valuesBackwards()) {
      const { segment } = request;
      const status = this.getSegmentStatus(segment);
      if (status === "high-demand") break;

      if (status === "low-demand") {
        this.lowDemandQueue.addToStart(segment.localId, request);
      }
      this.lowDemandQueue.delete(segment.localId);
    }

    // move high demand values (if exist) from low demand queue
    for (const request of this.lowDemandQueue.values()) {
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
    this.highDemandQueue.forEach((r) => r.abort());
    this.lowDemandQueue.forEach((r) => r.abort());
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

class SegmentRequest {
  segment: Segment;
  private status: "not-started" | "pending" | "completed" = "not-started";
  private abortHandler?: () => void;
  private loadedHandler?: () => void;

  constructor(segment: Segment) {
    this.segment = segment;
  }

  setAbortHandler(handler: () => void) {
    this.abortHandler = handler;
  }

  setLoadedHandler(handler: () => void) {
    this.loadedHandler = handler;
  }

  loaded() {
    this.status = "completed";
    this.loadedHandler?.();
  }

  abort() {
    this.abortHandler?.();
  }
}
