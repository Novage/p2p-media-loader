import { Segment, Settings, Stream } from "./types";
import { EventDispatcher } from "./event-dispatcher";
import * as StreamUtils from "./utils/stream";
import Debug from "debug";

type StorageSettings = Pick<
  Settings,
  "cachedSegmentExpiration" | "cachedSegmentsCount"
>;

function getStorageItemId(segment: Segment) {
  const streamExternalId = StreamUtils.getStreamShortId(segment.stream);
  return `${streamExternalId}|${segment.externalId}`;
}

type StorageItem = {
  segment: Segment;
  data: ArrayBuffer;
  lastAccessed: number;
};

type StorageEventHandlers = {
  [key in `onStorageUpdated${string}`]: (steam: Stream) => void;
};

export class SegmentsMemoryStorage {
  private cache = new Map<string, StorageItem>();
  private _isInitialized = false;
  private readonly isSegmentLockedPredicates: ((
    segment: Segment
  ) => boolean)[] = [];
  private readonly logger: Debug.Debugger;
  private readonly events = new EventDispatcher<StorageEventHandlers>();

  constructor(
    private readonly masterManifestUrl: string,
    private readonly settings: StorageSettings
  ) {
    this.logger = Debug("core:segment-memory-storage");
    this.logger.color = "RebeccaPurple";
  }

  async initialize() {
    this._isInitialized = true;
    this.logger("initialized");
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  addIsSegmentLockedPredicate(predicate: (segment: Segment) => boolean) {
    this.isSegmentLockedPredicates.push(predicate);
  }

  private isSegmentLocked(segment: Segment): boolean {
    return this.isSegmentLockedPredicates.some((p) => p(segment));
  }

  async storeSegment(segment: Segment, data: ArrayBuffer) {
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

  async getSegmentData(segment: Segment): Promise<ArrayBuffer | undefined> {
    const itemId = getStorageItemId(segment);
    const cacheItem = this.cache.get(itemId);
    if (cacheItem === undefined) return undefined;

    cacheItem.lastAccessed = performance.now();
    return cacheItem.data;
  }

  hasSegment(segment: Segment): boolean {
    const id = getStorageItemId(segment);
    return this.cache.has(id);
  }

  getStoredSegmentExternalIdsOfStream(stream: Stream) {
    const streamId = StreamUtils.getStreamShortId(stream);
    const externalIds: string[] = [];
    for (const { segment } of this.cache.values()) {
      const itemStreamId = StreamUtils.getStreamShortId(segment.stream);
      if (itemStreamId === streamId) externalIds.push(segment.externalId);
    }
    return externalIds;
  }

  private async clear(): Promise<boolean> {
    const itemsToDelete: string[] = [];
    const remainingItems: [string, StorageItem][] = [];
    const streamsOfChangedItems = new Set<Stream>();

    // Delete old segments
    const now = performance.now();

    for (const entry of this.cache.entries()) {
      const [itemId, item] = entry;
      const { lastAccessed, segment } = item;
      if (now - lastAccessed > this.settings.cachedSegmentExpiration) {
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
      remainingItems.length - this.settings.cachedSegmentsCount;
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
    listener: StorageEventHandlers["onStorageUpdated"]
  ) {
    const localId = StreamUtils.getStreamShortId(stream);
    this.events.subscribe(`onStorageUpdated-${localId}`, listener);
  }

  unsubscribeFromUpdate(
    stream: Stream,
    listener: StorageEventHandlers["onStorageUpdated"]
  ) {
    const localId = StreamUtils.getStreamShortId(stream);
    this.events.unsubscribe(`onStorageUpdated-${localId}`, listener);
  }

  private dispatchStorageUpdatedEvent(stream: Stream) {
    this.events.dispatch(
      `onStorageUpdated${StreamUtils.getStreamShortId(stream)}`,
      stream
    );
  }

  public async destroy() {
    this.cache.clear();
    this._isInitialized = false;
  }
}
