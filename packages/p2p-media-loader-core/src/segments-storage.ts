import { SegmentWithStream, Stream } from "./types";
import * as StreamUtils from "./utils/stream";
import debug from "debug";
import { EventTarget } from "./utils/event-target";
import { ReadonlyCoreConfig } from "./internal-types";

type StorageConfig = Pick<
  ReadonlyCoreConfig,
  "cachedSegmentExpiration" | "cachedSegmentsCount"
>;

function getStorageItemId(segment: SegmentWithStream) {
  const streamExternalId = StreamUtils.getStreamShortId(segment.stream);
  return `${streamExternalId}|${segment.externalId}`;
}

type StorageItem = {
  segment: SegmentWithStream;
  data: ArrayBuffer;
  lastAccessed: number;
};

type StorageEventHandlers = {
  [key in `onStorageUpdated-${string}`]: (steam: Stream) => void;
};

export class SegmentsMemoryStorage {
  private cache = new Map<string, StorageItem>();
  private _isInitialized = false;
  private readonly isSegmentLockedPredicates: ((
    segment: SegmentWithStream,
  ) => boolean)[] = [];
  private readonly logger: debug.Debugger;
  private readonly eventTarget = new EventTarget<StorageEventHandlers>();

  constructor(
    private readonly masterManifestUrl: string,
    private readonly storageConfig: StorageConfig,
  ) {
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
  async storeSegment(segment: SegmentWithStream, data: ArrayBuffer) {
    const id = getStorageItemId(segment);
    this.cache.set(id, {
      segment,
      data,
      lastAccessed: performance.now(),
    });
    this.logger(`add segment: ${id}`);
    this.dispatchStorageUpdatedEvent(segment.stream);
    void this.clear();
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
    const streamId = StreamUtils.getStreamShortId(stream);
    const externalIds: number[] = [];
    for (const { segment } of this.cache.values()) {
      const itemStreamId = StreamUtils.getStreamShortId(segment.stream);
      if (itemStreamId === streamId) externalIds.push(segment.externalId);
    }
    return externalIds;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async clear(): Promise<boolean> {
    const itemsToDelete: string[] = [];
    const remainingItems: [string, StorageItem][] = [];
    const streamsOfChangedItems = new Set<Stream>();

    // Delete old segments
    const now = performance.now();

    for (const entry of this.cache.entries()) {
      const [itemId, item] = entry;
      const { lastAccessed, segment } = item;
      if (now - lastAccessed > this.storageConfig.cachedSegmentExpiration) {
        if (!this.isSegmentLocked(segment)) {
          itemsToDelete.push(itemId);
          streamsOfChangedItems.add(segment.stream);
        }
      } else {
        remainingItems.push(entry);
      }
    }

    // Delete segments over cached count
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
    const localId = StreamUtils.getStreamShortId(stream);
    this.eventTarget.addEventListener(`onStorageUpdated-${localId}`, listener);
  }

  unsubscribeFromUpdate(
    stream: Stream,
    listener: StorageEventHandlers["onStorageUpdated-"],
  ) {
    const localId = StreamUtils.getStreamShortId(stream);
    this.eventTarget.removeEventListener(
      `onStorageUpdated-${localId}`,
      listener,
    );
  }

  private dispatchStorageUpdatedEvent(stream: Stream) {
    this.eventTarget.dispatchEvent(
      `onStorageUpdated-${StreamUtils.getStreamShortId(stream)}`,
      stream,
    );
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async destroy() {
    this.cache.clear();
    this._isInitialized = false;
  }
}
