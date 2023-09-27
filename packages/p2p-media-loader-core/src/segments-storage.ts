import { Segment, Settings, Stream } from "./types";

type StorageSettings = Pick<
  Settings,
  "cachedSegmentExpiration" | "cachedSegmentsCount" | "storageCleanupInterval"
>;

function getStreamShortExternalId(stream: Readonly<Stream>) {
  const { type, index } = stream;
  return `${type}-${index}`;
}

function getStorageItemId(stream: Stream, segment: Segment | string) {
  const segmentExternalId =
    typeof segment === "string" ? segment : segment.externalId;
  const streamExternalId = getStreamShortExternalId(stream);
  return `${streamExternalId}|${segmentExternalId}`;
}

class Subscriptions<T extends (...args: unknown[]) => void> {
  private readonly list: Set<T>;

  constructor(handlers: T | T[]) {
    this.list = new Set<T>(Array.isArray(handlers) ? handlers : [handlers]);
  }

  add(handler: T) {
    this.list.add(handler);
  }

  remove(handler: T) {
    this.list.delete(handler);
  }

  fire(...args: Parameters<T>) {
    for (const handler of this.list) {
      handler(...args);
    }
  }

  get isEmpty() {
    return this.list.size === 0;
  }
}

type StorageItem = {
  streamId: string;
  segment: Segment;
  data: ArrayBuffer;
  lastAccessed: number;
};

export class SegmentsMemoryStorage {
  private cache = new Map<string, StorageItem>();
  private _isInitialized = false;
  private cleanupIntervalId?: number;
  private readonly isSegmentLockedPredicates: ((
    segment: Segment
  ) => boolean)[] = [];
  private onUpdateSubscriptions = new Map<string, Subscriptions<() => void>>();

  constructor(
    private readonly masterManifestUrl: string,
    private readonly settings: StorageSettings
  ) {}

  async initialize() {
    this._isInitialized = true;
    this.cleanupIntervalId = window.setInterval(
      () => this.clear(),
      this.settings.storageCleanupInterval
    );
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

  async storeSegment(stream: Stream, segment: Segment, data: ArrayBuffer) {
    const id = getStorageItemId(stream, segment);
    const streamId = getStreamShortExternalId(stream);
    this.cache.set(id, {
      streamId,
      segment,
      data,
      lastAccessed: performance.now(),
    });
    this.fireOnUpdateSubscriptions(streamId);
  }

  async getSegmentData(
    stream: Stream,
    segment: Segment | string
  ): Promise<ArrayBuffer | undefined> {
    const itemId = getStorageItemId(stream, segment);
    const cacheItem = this.cache.get(itemId);
    if (cacheItem === undefined) return undefined;

    cacheItem.lastAccessed = performance.now();
    return cacheItem.data;
  }

  hasSegment(segment: Segment, stream: Stream): boolean {
    const id = getStorageItemId(stream, segment);
    return this.cache.has(id);
  }

  getStoredSegmentExternalIdsOfStream(stream: Stream) {
    const streamId = getStreamShortExternalId(stream);
    const externalIds: string[] = [];
    for (const { streamId: itemStreamId, segment } of this.cache.values()) {
      if (itemStreamId === streamId) externalIds.push(segment.externalId);
    }
    return externalIds;
  }

  private async clear(): Promise<boolean> {
    const itemsToDelete: string[] = [];
    const remainingItems: [string, StorageItem][] = [];
    const streamIdsOfChangedItems = new Set<string>();

    // Delete old segments
    const now = performance.now();

    for (const entry of this.cache.entries()) {
      const [itemId, item] = entry;
      const { lastAccessed, segment, streamId } = item;
      if (now - lastAccessed > this.settings.cachedSegmentExpiration) {
        if (!this.isSegmentLocked(segment)) {
          itemsToDelete.push(itemId);
          streamIdsOfChangedItems.add(streamId);
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

      for (const [itemId, { segment, streamId }] of remainingItems) {
        if (!this.isSegmentLocked(segment)) {
          itemsToDelete.push(itemId);
          streamIdsOfChangedItems.add(streamId);
          countOverhead--;
          if (countOverhead === 0) break;
        }
      }
    }

    if (itemsToDelete.length) {
      itemsToDelete.forEach((id) => this.cache.delete(id));
      for (const streamId of streamIdsOfChangedItems) {
        this.fireOnUpdateSubscriptions(streamId);
      }
    }

    return itemsToDelete.length > 0;
  }

  subscribeOnUpdate(stream: Stream, handler: () => void) {
    const streamId = getStreamShortExternalId(stream);
    const handlers = this.onUpdateSubscriptions.get(streamId);
    if (!handlers) {
      this.onUpdateSubscriptions.set(streamId, new Subscriptions(handler));
    } else {
      handlers.add(handler);
    }
  }

  unsubscribeFromUpdate(stream: Stream, handler: () => void) {
    const streamId = getStreamShortExternalId(stream);
    const handlers = this.onUpdateSubscriptions.get(streamId);
    if (handlers) {
      handlers.remove(handler);
      if (handlers.isEmpty) this.onUpdateSubscriptions.delete(streamId);
    }
  }

  private fireOnUpdateSubscriptions(streamId: string) {
    this.onUpdateSubscriptions.get(streamId)?.fire();
  }

  public async destroy() {
    this.cache.clear();
    this.onUpdateSubscriptions.clear();
    this._isInitialized = false;
    clearInterval(this.cleanupIntervalId);
  }
}
