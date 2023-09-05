import { Segment, StreamWithSegments } from "./types";
import { LinkedMap } from "./linked-map";
import { SegmentLoadStatus } from "./internal-types";
import * as Utils from "./utils";
import { Playback } from "./playback";

export type LoadQueueItem = {
  segment: Segment;
  statuses: Set<SegmentLoadStatus>;
};

export class LoadQueue {
  private readonly queue = new LinkedMap<string, LoadQueueItem>();
  private _activeStream?: StreamWithSegments;
  private isSegmentLoaded?: (segmentId: string) => boolean;
  private lastRequestedSegment?: Segment;
  private segmentDuration?: number;
  private updateHandlers: ((removedSegmentIds?: string[]) => void)[] = [];
  private prevUpdatePosition?: number;

  constructor(private readonly playback: Playback) {}

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

  updateOnSegmentRequest(segment: Segment, stream: StreamWithSegments) {
    const segmentsToAbortIds: string[] = [];
    if (this._activeStream !== stream) {
      this._activeStream = stream;
      this.queue.forEach(([segmentId]) => segmentsToAbortIds.push(segmentId));
      this.queue.clear();
    }
    this.lastRequestedSegment = segment;
    const addedSegments = this.addActualSegmentsToQueue();

    if (addedSegments?.length) {
      this.updateHandlers.forEach((handler) => handler());
    }
  }

  updateOnPlaybackChange() {
    const { position, rate } = this.playback;
    const avgSegmentDuration = this.getAvgSegmentDuration();
    const isRateChanged =
      this.playback.rate === undefined || rate !== this.playback.rate;
    const isPositionSignificantlyChanged =
      this.prevUpdatePosition === undefined ||
      Math.abs(position - this.prevUpdatePosition) / avgSegmentDuration >= 0.45;

    if (!isRateChanged && !isPositionSignificantlyChanged) return;
    this.prevUpdatePosition = position;

    const { removedSegmentIds, statusChangedSegmentIds } =
      this.removeNotActualSegmentsAndUpdateStatuses();
    const addedSegments = this.addActualSegmentsToQueue();

    if (
      removedSegmentIds.length ||
      statusChangedSegmentIds.length ||
      addedSegments?.length
    ) {
      this.updateHandlers.forEach((handler) => handler(removedSegmentIds));
    }
  }

  private addActualSegmentsToQueue() {
    if (!this._activeStream || !this.lastRequestedSegment) return;

    const newSegmentIds: string[] = [];
    let prevSegmentId: string | undefined;

    const nextToLastRequested = this._activeStream.segments.getNextTo(
      this.lastRequestedSegment.localId
    )?.[1];
    // it's needed when the segment requested by the plugin
    // (lastRequestedSegment) ends before current playhead position
    const nextSegmentStatuses =
      nextToLastRequested &&
      Utils.getSegmentLoadStatuses(nextToLastRequested, this.playback);

    let i = 0;
    for (const [segmentId, segment] of this._activeStream.segments.entries(
      this.lastRequestedSegment.localId
    )) {
      if (this.isSegmentLoaded?.(segmentId)) continue;
      if (this.queue.has(segmentId)) {
        prevSegmentId = segmentId;
        continue;
      }
      const statuses = Utils.getSegmentLoadStatuses(segment, this.playback);
      if (!statuses && !(i === 0 && nextSegmentStatuses)) {
        break;
      }

      const item: LoadQueueItem = {
        segment,
        statuses: statuses ?? new Set(["high-demand"]),
      };
      if (prevSegmentId) this.queue.addAfter(prevSegmentId, segmentId, item);
      else this.queue.addToStart(segmentId, item);
      newSegmentIds.push(segmentId);
      prevSegmentId = segmentId;
      i++;
    }
    return newSegmentIds;
  }

  private removeNotActualSegmentsAndUpdateStatuses() {
    const removedSegmentIds: string[] = [];
    const statusChangedSegmentIds: string[] = [];
    for (const [segmentId, item] of this.queue.entries()) {
      const statuses = Utils.getSegmentLoadStatuses(
        item.segment,
        this.playback
      );

      if (!statuses) {
        removedSegmentIds.push(segmentId);
        this.queue.delete(segmentId);
      } else if (!areSetsEqual(item.statuses, statuses)) {
        item.statuses = statuses;
        statusChangedSegmentIds.push(segmentId);
      }
    }
    return { removedSegmentIds, statusChangedSegmentIds };
  }

  removeLoadedSegment(segmentId: string) {
    this.queue.delete(segmentId);
  }

  subscribeToUpdate(handler: (removedSegmentIds?: string[]) => void) {
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

  get activeStream() {
    return this._activeStream;
  }

  clear() {
    this.queue.clear();
    this._activeStream = undefined;
    this.lastRequestedSegment = undefined;
    this.segmentDuration = undefined;
    this.prevUpdatePosition = undefined;
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
