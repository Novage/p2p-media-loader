import { Segment, StreamWithSegments } from "./types";
import { LinkedMap } from "./linked-map";
import { Playback } from "./playback";
import * as Utils from "./utils";
import { SegmentsMemoryStorage } from "./segments-storage";
import { SegmentLoadStatus } from "./internal-types";

export type QueueItem = {
  segment: Segment;
  statuses: Set<SegmentLoadStatus>;
};

export class LoadQueue {
  private readonly queue = new LinkedMap<string, QueueItem>();
  private activeStream?: StreamWithSegments;
  private isSegmentLoaded?: (segmentId: string) => boolean;
  private lastRequestedSegment?: Segment;
  private prevPosition?: number;
  private prevRate?: number;
  private segmentDuration = 0;
  private updateHandler?: () => void;

  constructor(private readonly playback: Playback) {}

  updateOnStreamChange(segment: Segment, stream: StreamWithSegments) {
    const segmentsToAbortIds: string[] = [];
    if (this.activeStream !== stream) {
      this.activeStream = stream;
      this.queue.forEach(([segmentId]) => segmentsToAbortIds.push(segmentId));
      this.queue.clear();
    }
    this.lastRequestedSegment = segment;
    this.addNewSegmentsToQueue();
  }

  playbackUpdate(position: number, rate: number) {
    const isRateChanged = this.prevRate === undefined || rate !== this.prevRate;
    const isPositionSignificantlyChanged =
      this.prevPosition === undefined ||
      Math.abs(position - this.prevPosition) / this.segmentDuration < 0.8;
    if (!isRateChanged && !isPositionSignificantlyChanged) {
      return;
    }
    if (isRateChanged) this.prevRate = rate;
    if (isPositionSignificantlyChanged) this.prevPosition = position;
    this.clearNotActualSegmentsUpdateStatuses();
    this.addNewSegmentsToQueue();
  }

  addNewSegmentsToQueue() {
    if (!this.activeStream || !this.lastRequestedSegment) return;

    let newQueueSegmentsCount = 0;
    let prevSegmentId: string | undefined;
    for (const [segmentId, segment] of this.activeStream.segments.entries(
      this.lastRequestedSegment.localId
    )) {
      if (this.isSegmentLoaded?.(segmentId)) continue;
      if (this.queue.has(segmentId)) {
        prevSegmentId = segmentId;
        continue;
      }
      const statuses = Utils.getSegmentLoadStatuses(segment, this.playback);
      if (!statuses) break;

      const info = { segment, statuses };
      if (prevSegmentId) this.queue.addAfter(prevSegmentId, segmentId, info);
      else this.queue.addToStart(segmentId, info);
      newQueueSegmentsCount++;
      prevSegmentId = segmentId;
    }

    return newQueueSegmentsCount;
  }

  private clearNotActualSegmentsUpdateStatuses() {
    const notActualSegments: string[] = [];
    for (const [segmentId, segmentInfo] of this.queue.entries()) {
      const statuses = Utils.getSegmentLoadStatuses(
        segmentInfo.segment,
        this.playback
      );
      if (!statuses) {
        notActualSegments.push(segmentId);
        this.queue.delete(segmentId);
      } else {
        segmentInfo.statuses = statuses;
      }
    }
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
