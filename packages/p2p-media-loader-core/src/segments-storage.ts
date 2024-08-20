import { CommonCoreConfig } from "./types.js";
import debug from "debug";
import { EventTarget } from "./utils/event-target.js";
import { ISegmentsStorage } from "./segments-storage/segments-storage.interface.js";

type StorageConfig = CommonCoreConfig;

const DEFAULT_LIVE_CACHED_SEGMENT_EXPIRATION = 1200;

type SegmentDataItem = {
  segmentId: number;
  streamId: string;
  data: ArrayBuffer;
  lastAccessed: number;
};

type StorageEventHandlers = {
  [key in `onStorageUpdated-${string}`]: () => void;
};

function getStorageItemId(streamSwarmId: string, externalId: number) {
  return `${streamSwarmId}|${externalId}`;
}

export class SegmentsMemoryStorage implements ISegmentsStorage {
  private cache = new Map<string, SegmentDataItem>();
  private _isInitialized = false;
  private readonly isSegmentLockedPredicates: ((
    streamId: string,
    segmentId: number,
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

  isInitialized(): boolean {
    return this._isInitialized;
  }

  addIsSegmentLockedPredicate(
    predicate: (streamId: string, segmentId: number) => boolean,
  ) {
    this.isSegmentLockedPredicates.push(predicate);
  }

  private isSegmentLocked(streamId: string, segmentId: number): boolean {
    return this.isSegmentLockedPredicates.some((p) => p(streamId, segmentId));
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async storeSegment(
    streamId: string,
    segmentId: number,
    data: ArrayBuffer,
    isLiveStream: boolean,
  ) {
    const storageId = getStorageItemId(streamId, segmentId);

    this.cache.set(storageId, {
      data,
      segmentId,
      streamId,
      lastAccessed: performance.now(),
    });

    this.logger(`add segment: ${segmentId}`);
    this.dispatchStorageUpdatedEvent(streamId);
    void this.clear(isLiveStream);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSegmentData(
    streamId: string,
    segmentId: number,
  ): Promise<ArrayBuffer | undefined> {
    const segmentStorageId = getStorageItemId(streamId, segmentId);
    const dataItem = this.cache.get(segmentStorageId);

    if (dataItem === undefined) return undefined;

    dataItem.lastAccessed = performance.now();

    return dataItem.data;
  }

  hasSegment(streamId: string, externalId: number): boolean {
    const segmentStorageId = getStorageItemId(streamId, externalId);
    const segment = this.cache.get(segmentStorageId);

    return segment !== undefined;
  }

  getStoredSegmentExternalIdsOfStream(streamSwarm: string) {
    const externalIds: number[] = [];

    for (const { segmentId, streamId } of this.cache.values()) {
      if (streamId !== streamSwarm) continue;
      externalIds.push(segmentId);
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

    for (const entry of this.cache.entries()) {
      const [itemId, item] = entry;
      const { lastAccessed, segmentId, streamId } = item;

      if (now - lastAccessed > cacheSegmentExpiration) {
        if (!this.isSegmentLocked(streamId, segmentId)) {
          itemsToDelete.push(itemId);
          streamsOfChangedItems.add(streamId);
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

        for (const [itemId, { streamId, segmentId }] of remainingItems) {
          if (!this.isSegmentLocked(streamId, segmentId)) {
            itemsToDelete.push(itemId);
            streamsOfChangedItems.add(streamId);
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
