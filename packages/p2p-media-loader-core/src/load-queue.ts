import { Segment, StreamWithSegments } from "./types";
import { LinkedMap } from "./linked-map";
import { SegmentLoadStatus } from "./internal-types";

export type LoadQueueItem = {
  segment: Segment;
  statuses: Set<SegmentLoadStatus>;
};

export class LoadQueue {
  private readonly queue = new LinkedMap<string, LoadQueueItem>();
  private activeStream?: StreamWithSegments;
  private isSegmentLoaded?: (segmentId: string) => boolean;
  private lastRequestedSegment?: Segment;
  private position = 0;
  private rate = 1;
  private segmentDuration?: number;
  private updateHandlers: ((removedSegmentIds: string[]) => void)[] = [];
  private highDemandBufferMargin!: number;
  private httpBufferMargin!: number;
  private p2pBufferMargin!: number;

  constructor(
    private readonly settings: {
      highDemandBufferLength: number;
      httpBufferLength: number;
      p2pBufferLength: number;
    }
  ) {
    this.updateBufferMargins();
  }

  *items() {
    for (const [, item] of this.queue.entries()) {
      yield item;
    }
  }

  *itemsBackwards() {
    for (const [, item] of this.queue.entriesBackwards()) {
      yield item;
    }
  }

  updateIfStreamChanged(segment: Segment, stream: StreamWithSegments) {
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
    const avgSegmentDuration = this.getAvgSegmentDuration();
    const isRateChanged = this.rate === undefined || rate !== this.rate;
    const isPositionSignificantlyChanged =
      this.position === undefined ||
      Math.abs(position - this.position) / avgSegmentDuration > 0.5;
    if (!isRateChanged && !isPositionSignificantlyChanged) return;
    if (isRateChanged) this.rate = rate;
    if (isPositionSignificantlyChanged) this.position = position;
    this.updateBufferMargins();

    const { removedSegmentIds, statusChangedSegmentIds } =
      this.clearNotActualSegmentsUpdateStatuses();
    const newSegmentIds = this.addNewSegmentsToQueue();

    if (
      removedSegmentIds.length ||
      statusChangedSegmentIds.length ||
      newSegmentIds?.length
    ) {
      this.updateHandlers.forEach((handler) => handler(removedSegmentIds));
    }
  }

  private addNewSegmentsToQueue() {
    if (!this.activeStream || !this.lastRequestedSegment) return;

    const newSegmentIds: string[] = [];
    let prevSegmentId: string | undefined;
    for (const [segmentId, segment] of this.activeStream.segments.entries(
      this.lastRequestedSegment.localId
    )) {
      if (this.isSegmentLoaded?.(segmentId)) continue;
      if (this.queue.has(segmentId)) {
        prevSegmentId = segmentId;
        continue;
      }
      const statuses = this.getSegmentStatuses(segment);
      if (!statuses) break;

      const info = { segment, statuses };
      if (prevSegmentId) this.queue.addAfter(prevSegmentId, segmentId, info);
      else this.queue.addToStart(segmentId, info);
      newSegmentIds.push(segmentId);
      prevSegmentId = segmentId;
    }

    return newSegmentIds;
  }

  private clearNotActualSegmentsUpdateStatuses() {
    const removedSegmentIds: string[] = [];
    const statusChangedSegmentIds: string[] = [];
    for (const [segmentId, item] of this.queue.entries()) {
      const statuses = this.getSegmentStatuses(item.segment);
      if (!statuses) {
        removedSegmentIds.push(segmentId);
        this.queue.delete(segmentId);
      } else if (areSetsEqual(item.statuses, statuses)) {
        item.statuses = statuses;
        statusChangedSegmentIds.push(segmentId);
      }
    }
    return { removedSegmentIds, statusChangedSegmentIds };
  }

  private updateBufferMargins() {
    if (this.position === undefined || this.rate === undefined) return;
    const { highDemandBufferLength, p2pBufferLength, httpBufferLength } =
      this.settings;

    this.highDemandBufferMargin =
      this.position + highDemandBufferLength * this.rate;
    this.httpBufferMargin = this.position + httpBufferLength * this.rate;
    this.p2pBufferMargin = this.position + p2pBufferLength * this.rate;
  }

  private getSegmentStatuses(segment: Segment) {
    const {
      highDemandBufferMargin,
      httpBufferMargin,
      p2pBufferMargin,
      position,
    } = this;
    const { startTime } = segment;
    const statuses = new Set<SegmentLoadStatus>();
    if (startTime >= position && startTime < highDemandBufferMargin) {
      statuses.add("high-demand");
    }
    if (startTime >= position && startTime < httpBufferMargin) {
      statuses.add("http-downloadable");
    }
    if (startTime >= position && startTime < p2pBufferMargin) {
      statuses.add("p2p-downloadable");
    }
    if (statuses.size) return statuses;
  }

  removeLoadedSegment(segmentId: string) {
    this.queue.delete(segmentId);
  }

  subscribeToUpdate(handler: (removedSegmentIds: string[]) => void) {
    this.updateHandlers.push(handler);
  }

  setIsSegmentLoadedPredicate(predicate: (segmentId: string) => boolean) {
    this.isSegmentLoaded = predicate;
  }

  private getAvgSegmentDuration() {
    if (this.segmentDuration) return this.segmentDuration;
    let sum = 0;
    this.queue.forEach(
      ([, { segment }]) => (sum += segment.endTime - segment.startTime)
    );
    this.segmentDuration = sum / this.queue.size;
    return this.segmentDuration;
  }

  get length() {
    return this.queue.size;
  }
}

function areSetsEqual<T>(set1: Set<T>, set2: Set<T>): boolean {
  if (set1.size !== set2.size) return false;
  for (const item of set1) {
    if (!set2.has(item)) return false;
  }
  return true;
}

function getRandomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
