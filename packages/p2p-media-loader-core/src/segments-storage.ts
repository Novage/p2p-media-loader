import { CommonCoreConfig, SegmentWithStream, Stream } from "./types.js";
import * as StreamUtils from "./utils/stream.js";
import debug from "debug";
import { EventTarget } from "./utils/event-target.js";

type StorageConfig = CommonCoreConfig;

function getStorageItemId(segment: SegmentWithStream) {
  const streamId = StreamUtils.getStreamId(segment.stream);
  return `${streamId}|${segment.externalId}`;
}

type StorageItem = {
  segment: SegmentWithStream;
  data: ArrayBuffer;
  lastAccessed: number;
};

type StorageEventHandlers = {
  [key in `onStorageUpdated-${string}`]: (steam: Stream) => void;
};

const DEFAULT_LIVE_CACHED_SEGMENT_EXPIRATION = 1200;

export class SegmentsMemoryStorage {
  private cache = new Map<string, StorageItem>();
  private _isInitialized = false;
  private readonly isSegmentLockedPredicates: ((
    segment: SegmentWithStream,
  ) => boolean)[] = [];
  private readonly logger: debug.Debugger;
  private readonly eventTarget = new EventTarget<StorageEventHandlers>();

  constructor(private readonly storageConfig: StorageConfig) {
    this.logger = debug("p2pml-core:segment-memory-storage");
    this.logger.color = "RebeccaPurple";
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async initialize() {
    this._isInitialized = true;
    this.logger("initialized");
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  addIsSegmentLockedPredicate(
    predicate: (segment: SegmentWithStream) => boolean,
  ) {
    this.isSegmentLockedPredicates.push(predicate);
  }

  private isSegmentLocked(segment: SegmentWithStream): boolean {
    return this.isSegmentLockedPredicates.some((p) => p(segment));
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async storeSegment(
    segment: SegmentWithStream,
    data: ArrayBuffer,
    isLiveStream: boolean,
  ) {
    const id = getStorageItemId(segment);
    this.cache.set(id, {
      segment,
      data,
      lastAccessed: performance.now(),
    });
    this.logger(`add segment: ${id}`);
    this.dispatchStorageUpdatedEvent(segment.stream);
    void this.clear(isLiveStream);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSegmentData(
    segment: SegmentWithStream,
  ): Promise<ArrayBuffer | undefined> {
    const itemId = getStorageItemId(segment);
    const cacheItem = this.cache.get(itemId);
    if (cacheItem === undefined) return undefined;

    cacheItem.lastAccessed = performance.now();
    return cacheItem.data;
  }

  hasSegment(segment: SegmentWithStream): boolean {
    const id = getStorageItemId(segment);
    return this.cache.has(id);
  }

  getStoredSegmentExternalIdsOfStream(stream: Stream) {
    const streamId = StreamUtils.getStreamId(stream);
    const externalIds: number[] = [];
    for (const { segment } of this.cache.values()) {
      const itemStreamId = StreamUtils.getStreamId(segment.stream);
      if (itemStreamId === streamId) externalIds.push(segment.externalId);
    }
    return externalIds;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async clear(isLiveStream: boolean): Promise<boolean> {
    const cacheSegmentExpiration =
      (this.storageConfig.cachedSegmentExpiration ??
        (isLiveStream ? DEFAULT_LIVE_CACHED_SEGMENT_EXPIRATION : 0)) * 1000;

    if (cacheSegmentExpiration === 0) return false;

    const itemsToDelete: string[] = [];
    const remainingItems: [string, StorageItem][] = [];
    const streamsOfChangedItems = new Set<Stream>();

    // Delete old segments
    const now = performance.now();

    for (const entry of this.cache.entries()) {
      const [itemId, item] = entry;
      const { lastAccessed, segment } = item;

      if (now - lastAccessed > cacheSegmentExpiration) {
        if (!this.isSegmentLocked(segment)) {
          itemsToDelete.push(itemId);
          streamsOfChangedItems.add(segment.stream);
        }
      } else {
        remainingItems.push(entry);
      }
    }

    // Delete segments over cached count
    if (this.storageConfig.cachedSegmentsCount > 0) {
      let countOverhead =
        remainingItems.length - this.storageConfig.cachedSegmentsCount;
      if (countOverhead > 0) {
        remainingItems.sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

        for (const [itemId, { segment }] of remainingItems) {
          if (!this.isSegmentLocked(segment)) {
            itemsToDelete.push(itemId);
            streamsOfChangedItems.add(segment.stream);
            countOverhead--;
            if (countOverhead === 0) break;
          }
        }
      }
    }

    if (itemsToDelete.length) {
      this.logger(`cleared ${itemsToDelete.length} segments`);
      itemsToDelete.forEach((id) => this.cache.delete(id));
      for (const stream of streamsOfChangedItems) {
        this.dispatchStorageUpdatedEvent(stream);
      }
    }

    return itemsToDelete.length > 0;
  }

  subscribeOnUpdate(
    stream: Stream,
    listener: StorageEventHandlers["onStorageUpdated-"],
  ) {
    const streamId = StreamUtils.getStreamId(stream);
    this.eventTarget.addEventListener(`onStorageUpdated-${streamId}`, listener);
  }

  unsubscribeFromUpdate(
    stream: Stream,
    listener: StorageEventHandlers["onStorageUpdated-"],
  ) {
    const streamId = StreamUtils.getStreamId(stream);
    this.eventTarget.removeEventListener(
      `onStorageUpdated-${streamId}`,
      listener,
    );
  }

  private dispatchStorageUpdatedEvent(stream: Stream) {
    this.eventTarget.dispatchEvent(
      `onStorageUpdated-${StreamUtils.getStreamId(stream)}`,
      stream,
    );
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async destroy() {
    this.cache.clear();
    this._isInitialized = false;
  }
}
