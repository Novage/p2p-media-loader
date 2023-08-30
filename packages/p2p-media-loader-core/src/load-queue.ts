import { Segment, StreamWithSegments } from "./types";
import { LinkedMap } from "./linked-map";
import { Playback } from "./playback";
import * as Utils from "./utils";
import { SegmentsMemoryStorage } from "./segments-storage";
import { SegmentLoadStatus } from "./internal-types";

export type QueueItem = {
  segment: Segment;
  statuses: Set<SegmentLoadStatus>;
  isLoading?: boolean;
  loadingType?: "http" | "p2p";
};

export class LoadQueue {
  private readonly queue = new LinkedMap<string, QueueItem>();
  private activeStream?: StreamWithSegments;

  constructor(
    private readonly playback: Playback,
    private readonly segmentStorage: SegmentsMemoryStorage
  ) {}

  *getSegmentsToLoad() {
    for (const [segmentId, segmentInfo] of this.queue.entries()) {
      if (this.queue.get(segmentId)?.isLoading) continue;
      yield segmentInfo;
    }
  }

  getRandomHttpLoadableSegment() {
    const notLoadingSegments = this.queue.filter(
      ([, { isLoading, statuses }]) =>
        !isLoading && statuses.has("http-downloadable")
    );
    if (!notLoadingSegments.length) return undefined;
    const randomIndex = getRandomInt(0, notLoadingSegments.length - 1);
    return notLoadingSegments[randomIndex][1];
  }

  getLastHttpLoadingItemAfter(segmentId: string) {
    for (const [itemSegmentId, item] of this.queue.entriesBackwards()) {
      if (itemSegmentId === segmentId) break;
      if (item.isLoading && item.loadingType === "http") {
        return item;
      }
    }
  }

  update(segment: Segment, stream: StreamWithSegments) {
    const segmentsToAbortIds: string[] = [];
    if (this.activeStream !== stream) {
      this.activeStream = stream;
      this.queue.forEach(([segmentId, { isLoading }]) => {
        if (isLoading) segmentsToAbortIds.push(segmentId);
      });
      this.queue.clear();
    }

    this.addNewSegmentsToQueue(segment);

    return { segmentsToAbortIds };
  }

  addNewSegmentsToQueue(requestedSegment: Segment) {
    if (!this.activeStream) return;

    let prevSegmentId: string | undefined;
    for (const [segmentId, segment] of this.activeStream.segments.entries(
      requestedSegment.localId
    )) {
      if (this.segmentStorage.hasSegment(segmentId)) continue;
      if (this.queue.has(segmentId)) {
        prevSegmentId = segmentId;
        continue;
      }
      const statuses = Utils.getSegmentLoadStatuses(segment, this.playback);
      if (!statuses) break;

      const info = { segment, statuses };
      if (prevSegmentId) this.queue.addAfter(prevSegmentId, segmentId, info);
      else this.queue.addToStart(segmentId, info);
      prevSegmentId = segmentId;
    }
  }

  clearNotInLoadRangeSegments() {
    const segmentsToAbortIds: string[] = [];
    for (const [segmentId, segmentInfo] of this.queue.entries()) {
      const statuses = Utils.getSegmentLoadStatuses(
        segmentInfo.segment,
        this.playback
      );
      if (!statuses) {
        segmentsToAbortIds.push(segmentId);
        this.queue.delete(segmentId);
      } else {
        segmentInfo.statuses = statuses;
      }
    }

    segmentsToAbortIds.forEach((id) => this.queue.delete(id));
    return { segmentsToAbortIds };
  }

  markSegmentAsLoading(segmentId: string, loadingType: "http" | "p2p") {
    const segmentInfo = this.queue.get(segmentId);
    if (!segmentInfo) return;

    segmentInfo.isLoading = true;
    segmentInfo.loadingType = loadingType;
  }

  markSegmentAsNotLoading(segmentId: string) {
    const segmentInfo = this.queue.get(segmentId);
    if (!segmentInfo) return;

    delete segmentInfo.isLoading;
    delete segmentInfo.loadingType;
  }

  removeLoadedSegment(segmentId: string) {
    this.queue.delete(segmentId);
  }

  get length() {
    return this.queue.size;
  }
}

function getRandomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
