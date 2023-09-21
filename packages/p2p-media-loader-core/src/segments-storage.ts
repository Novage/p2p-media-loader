import { Segment } from "./types";

export class SegmentsMemoryStorage {
  private cache = new Map<
    string,
    { segment: Segment; data: ArrayBuffer; lastAccessed: number }
  >();
  private readonly cachedSegmentIds = new Set<string>();
  private readonly isSegmentLockedPredicates: ((
    segment: Segment
  ) => boolean)[] = [];
  private onUpdateSubscriptions: (() => void)[] = [];
  private _isInitialized = false;

  constructor(
    private settings: {
      cachedSegmentExpiration: number;
      cachedSegmentsCount: number;
    }
  ) {}

  async initialize(masterManifestUrl: string) {
    this._isInitialized = true;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  addIsSegmentLockedPredicate(predicate: (segment: Segment) => boolean) {
    this.isSegmentLockedPredicates.push(predicate);
  }

  private isSegmentLocked(segment: Segment) {
    return this.isSegmentLockedPredicates.some((p) => p(segment));
  }

  subscribeOnUpdate(callback: () => void) {
    this.onUpdateSubscriptions.push(callback);
  }

  async storeSegment(segment: Segment, data: ArrayBuffer) {
    const id = segment.externalId;
    this.cache.set(id, {
      segment,
      data,
      lastAccessed: performance.now(),
    });
    this.cachedSegmentIds.add(id);
    this.onUpdateSubscriptions.forEach((c) => c());
  }

  async getSegmentData(
    segmentExternalId: string
  ): Promise<ArrayBuffer | undefined> {
    const cacheItem = this.cache.get(segmentExternalId);
    if (cacheItem === undefined) return undefined;

    cacheItem.lastAccessed = performance.now();
    return cacheItem.data;
  }

  hasSegment(segmentExternalId: string): boolean {
    return this.cachedSegmentIds.has(segmentExternalId);
  }

  get storedSegmentIds(): ReadonlySet<string> {
    return this.cachedSegmentIds;
  }

  async clear(): Promise<boolean> {
    const segmentsToDelete: string[] = [];
    const remainingSegments: {
      lastAccessed: number;
      segment: Segment;
    }[] = [];

    // Delete old segments
    const now = performance.now();

    for (const [
      segmentExternalId,
      { lastAccessed, segment },
    ] of this.cache.entries()) {
      if (now - lastAccessed > this.settings.cachedSegmentExpiration) {
        if (!this.isSegmentLocked(segment)) {
          segmentsToDelete.push(segmentExternalId);
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
        if (!this.isSegmentLocked(cachedSegment.segment)) {
          segmentsToDelete.push(cachedSegment.segment.externalId);
          countOverhead--;
          if (countOverhead === 0) break;
        }
      }
    }

    segmentsToDelete.forEach((id) => {
      this.cache.delete(id);
      this.cachedSegmentIds.delete(id);
    });
    if (segmentsToDelete.length) {
      this.onUpdateSubscriptions.forEach((c) => c());
    }
    return segmentsToDelete.length > 0;
  }

  public async destroy() {
    this.cache.clear();
    this.onUpdateSubscriptions = [];
    this._isInitialized = false;
  }
}
