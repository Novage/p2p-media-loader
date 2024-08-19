import { CommonCoreConfig } from "./types.js";
import debug from "debug";
import { EventTarget } from "./utils/event-target.js";
import { ISegmentsStorage } from "./segments-storage/segments-storage.interface.js";
import {
  SegmentDataItem,
  SegmentInfoItem,
} from "./segments-storage/segments-types.js";

type StorageConfig = CommonCoreConfig;

type StorageEventHandlers = {
  [key in `onStorageUpdated-${string}`]: () => void;
};

const DEFAULT_LIVE_CACHED_SEGMENT_EXPIRATION = 1200;

export class SegmentsMemoryStorage implements ISegmentsStorage {
  private cache = new Map<string, SegmentDataItem>();
  private cacheMap = new Map<string, Map<number, SegmentInfoItem>>();
  private _isInitialized = false;
  private readonly isSegmentLockedPredicates: ((
    segment: SegmentInfoItem,
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
    predicate: (segment: SegmentInfoItem) => boolean,
  ) {
    this.isSegmentLockedPredicates.push(predicate);
  }

  private isSegmentLocked(segment: SegmentInfoItem): boolean {
    return this.isSegmentLockedPredicates.some((p) => p(segment));
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async storeSegment(
    segmentInfoItem: SegmentInfoItem,
    segmentDataItem: SegmentDataItem,
    isLiveStream: boolean,
  ) {
    const { streamId, externalId, streamSwarmId } = segmentInfoItem;

    if (!this.cacheMap.has(streamSwarmId)) {
      this.cacheMap.set(streamSwarmId, new Map<number, SegmentInfoItem>());
    }

    const streamCache = this.cacheMap.get(streamSwarmId);

    if (streamCache === undefined) return;

    streamCache.set(externalId, segmentInfoItem);

    this.cache.set(segmentDataItem.storageId, segmentDataItem);
    this.logger(`add segment: ${segmentDataItem.storageId}`);
    this.dispatchStorageUpdatedEvent(streamId);
    void this.clear(isLiveStream);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSegmentData(
    segmentStorageId: string,
  ): Promise<ArrayBuffer | undefined> {
    const dataItem = this.cache.get(segmentStorageId);

    if (dataItem === undefined) return undefined;

    dataItem.lastAccessed = performance.now();
    return dataItem.data;
  }

  hasSegment(segmentStorageId: string): boolean {
    return this.cache.has(segmentStorageId);
  }

  getStoredSegmentExternalIdsOfStream(streamSwarmId: string) {
    const streamInfoCache = this.cacheMap.get(streamSwarmId);
    const externalIds: number[] = [];

    if (streamInfoCache === undefined) return externalIds;

    for (const [, segment] of streamInfoCache) {
      externalIds.push(segment.externalId);
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
    const remainingItems: [string, SegmentDataItem][] = [];
    const streamsOfChangedItems = new Set<string>();

    // Delete old segments
    const now = performance.now();

    for (const [id, item] of this.cache) {
      if (now - item.lastAccessed > cacheSegmentExpiration) {
        itemsToDelete.push(id);
      } else {
        remainingItems.push([id, item]);
        streamsOfChangedItems.add(item.streamId);
      }
    }

    // Delete segments over cached count
    if (this.storageConfig.cachedSegmentsCount > 0) {
      let countOverhead =
        remainingItems.length - this.storageConfig.cachedSegmentsCount;
      if (countOverhead > 0) {
        remainingItems.sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

        for (const [itemId, segment] of remainingItems) {
          if (!this.isSegmentLocked(segment)) {
            itemsToDelete.push(itemId);
            streamsOfChangedItems.add(segment.streamId);
            countOverhead--;
            if (countOverhead === 0) break;
          }
        }
      }
    }

    if (itemsToDelete.length) {
      this.logger(`cleared ${itemsToDelete.length} segments`);
      itemsToDelete.forEach((id) => {
        const segment = this.cache.get(id);
        if (!segment) return;

        this.cacheMap.get(segment.streamSwarmId)?.delete(segment.externalId);
        if (this.cacheMap.get(segment.streamSwarmId)?.size === 0) {
          this.cacheMap.delete(segment.streamSwarmId);
        }

        this.cache.delete(id);
      });
      for (const stream of streamsOfChangedItems) {
        this.dispatchStorageUpdatedEvent(stream);
      }
    }

    return itemsToDelete.length > 0;
  }

  subscribeOnUpdate(
    streamId: string,
    listener: StorageEventHandlers["onStorageUpdated-"],
  ) {
    this.eventTarget.addEventListener(`onStorageUpdated-${streamId}`, listener);
  }

  unsubscribeFromUpdate(
    streamId: string,
    listener: StorageEventHandlers["onStorageUpdated-"],
  ) {
    this.eventTarget.removeEventListener(
      `onStorageUpdated-${streamId}`,
      listener,
    );
  }

  private dispatchStorageUpdatedEvent(streamId: string) {
    this.eventTarget.dispatchEvent(`onStorageUpdated-${streamId}`);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async destroy() {
    this.cache.clear();
    this._isInitialized = false;
  }
}
