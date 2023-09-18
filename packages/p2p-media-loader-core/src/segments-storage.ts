import { Segment } from "./types";

export class SegmentsMemoryStorage {
  private cache = new Map<
    string,
    { segment: Segment; data: ArrayBuffer; lastAccessed: number }
  >();
  private isSegmentLockedPredicate?: (segment: Segment) => boolean;
  private onUpdateSubscriptions: (() => void)[] = [];

  constructor(
    private settings: {
      cachedSegmentExpiration: number;
      cachedSegmentsCount: number;
    }
  ) {}

  setIsSegmentLockedPredicate(predicate: (segment: Segment) => boolean) {
    this.isSegmentLockedPredicate = predicate;
  }

  subscribeOnUpdate(callback: () => void) {
    this.onUpdateSubscriptions.push(callback);
  }

  async storeSegment(segment: Segment, data: ArrayBuffer) {
    this.cache.set(segment.localId, {
      segment,
      data,
      lastAccessed: performance.now(),
    });
    this.onUpdateSubscriptions.forEach((c) => c());
  }

  async getSegmentData(segmentId: string): Promise<ArrayBuffer | undefined> {
    const cacheItem = this.cache.get(segmentId);
    if (cacheItem === undefined) return undefined;

    cacheItem.lastAccessed = performance.now();
    return cacheItem.data;
  }

  async getStoredSegmentIds() {
    const segmentIds = new Set<string>();
    for (const segmentId of this.cache.keys()) {
      segmentIds.add(segmentId);
    }
    return segmentIds;
  }

  async clear(): Promise<boolean> {
    const segmentsToDelete: string[] = [];
    const remainingSegments: {
      lastAccessed: number;
      segment: Segment;
    }[] = [];

    // Delete old segments
    const now = performance.now();

    for (const [segmentId, { lastAccessed, segment }] of this.cache.entries()) {
      if (now - lastAccessed > this.settings.cachedSegmentExpiration) {
        if (!this.isSegmentLockedPredicate?.(segment)) {
          segmentsToDelete.push(segmentId);
        }
      } else {
        remainingSegments.push({ segment, lastAccessed });
      }
    }

    // Delete segments over cached count
    let countOverhead =
      remainingSegments.length - this.settings.cachedSegmentsCount;
    if (countOverhead > 0) {
      remainingSegments.sort((a, b) => a.lastAccessed - b.lastAccessed);

      for (const cachedSegment of remainingSegments) {
        if (!this.isSegmentLockedPredicate?.(cachedSegment.segment)) {
          segmentsToDelete.push(cachedSegment.segment.localId);
          countOverhead--;
          if (countOverhead === 0) break;
        }
      }
    }

    segmentsToDelete.forEach((id) => this.cache.delete(id));
    if (segmentsToDelete.length) {
      this.onUpdateSubscriptions.forEach((c) => c());
    }
    return segmentsToDelete.length > 0;
  }

  public async destroy() {
    this.cache.clear();
    this.onUpdateSubscriptions = [];
  }
}
