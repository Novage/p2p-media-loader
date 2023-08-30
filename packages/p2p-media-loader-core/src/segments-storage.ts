import { Playback } from "./playback";
import { Segment } from "./types";
import * as Utils from "./utils";

export class SegmentsMemoryStorage {
  private cache = new Map<
    string,
    { segment: Segment; data: ArrayBuffer; lastAccessed: number }
  >();

  constructor(
    private readonly playback: Playback,
    private settings: {
      cachedSegmentExpiration: number;
      cachedSegmentsCount: number;
    }
  ) {}

  storeSegment(segment: Segment, data: ArrayBuffer) {
    this.cache.set(segment.localId, {
      segment,
      data,
      lastAccessed: performance.now(),
    });
  }

  getSegment(segmentId: string): ArrayBuffer | undefined {
    const cacheItem = this.cache.get(segmentId);
    if (cacheItem === undefined) return undefined;

    cacheItem.lastAccessed = performance.now();
    return cacheItem.data;
  }

  hasSegment(segmentId: string) {
    return this.cache.has(segmentId);
  }

  private isSegmentLocked(segment: Segment) {
    const statuses = Utils.getSegmentLoadStatuses(segment, this.playback);
    return !!statuses;
  }

  async clean(): Promise<boolean> {
    const segmentsToDelete: string[] = [];
    const remainingSegments: {
      lastAccessed: number;
      segment: Segment;
    }[] = [];

    // Delete old segments
    const now = performance.now();

    for (const [segmentId, { lastAccessed, segment }] of this.cache.entries()) {
      if (now - lastAccessed > this.settings.cachedSegmentExpiration) {
        segmentsToDelete.push(segmentId);
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
        if (this.isSegmentLocked(cachedSegment.segment)) {
          segmentsToDelete.push(cachedSegment.segment.localId);
          countOverhead--;
          if (countOverhead === 0) break;
        }
      }
    }

    segmentsToDelete.forEach((id) => this.cache.delete(id));
    return segmentsToDelete.length > 0;
  }

  public async destroy() {
    this.cache.clear();
  }
}
