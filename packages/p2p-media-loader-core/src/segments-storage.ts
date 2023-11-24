import { Segment, Settings, Stream } from "./types";
import Debug from "debug";

type StorageSettings = Pick<
  Settings,
  "cachedSegmentExpiration" | "cachedSegmentsCount"
>;

function getStreamShortExternalId(stream: Readonly<Stream>) {
  const { type, index } = stream;
  return `${type}-${index}`;
}

function getStorageItemId(segment: Segment) {
  const streamExternalId = getStreamShortExternalId(segment.stream);
  return `${streamExternalId}|${segment.externalId}`;
}

export class Subscriptions<
  T extends (...args: unknown[]) => void = () => void
> {
  private readonly list: Set<T>;

  constructor(handlers?: T | T[]) {
    if (handlers) {
      this.list = new Set<T>(Array.isArray(handlers) ? handlers : [handlers]);
    } else {
      this.list = new Set<T>();
    }
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
  segment: Segment;
  data: ArrayBuffer;
  lastAccessed: number;
};

export class SegmentsMemoryStorage {
  private cache = new Map<string, StorageItem>();
  private _isInitialized = false;
  private readonly isSegmentLockedPredicates: ((
    segment: Segment
  ) => boolean)[] = [];
  private onUpdateHandlers = new Map<string, Subscriptions>();
  private readonly logger: Debug.Debugger;

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
    const streamId = getStreamShortExternalId(segment.stream);
    this.cache.set(id, {
      segment,
      data,
      lastAccessed: performance.now(),
    });
    this.logger(`add segment: ${id}`);
    this.fireOnUpdateSubscriptions(streamId);
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
    const streamId = getStreamShortExternalId(stream);
    const externalIds: number[] = [];
    for (const { segment } of this.cache.values()) {
      const itemStreamId = getStreamShortExternalId(segment.stream);
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
      const { lastAccessed, segment } = item;
      if (now - lastAccessed > this.settings.cachedSegmentExpiration) {
        if (!this.isSegmentLocked(segment)) {
          const streamId = getStreamShortExternalId(segment.stream);
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

      for (const [itemId, { segment }] of remainingItems) {
        if (!this.isSegmentLocked(segment)) {
          const streamId = getStreamShortExternalId(segment.stream);
          itemsToDelete.push(itemId);
          streamIdsOfChangedItems.add(streamId);
          countOverhead--;
          if (countOverhead === 0) break;
        }
      }
    }

    if (itemsToDelete.length) {
      this.logger(`cleared ${itemsToDelete.length} segments`);
      itemsToDelete.forEach((id) => this.cache.delete(id));
      for (const streamId of streamIdsOfChangedItems) {
        this.fireOnUpdateSubscriptions(streamId);
      }
    }

    return itemsToDelete.length > 0;
  }

  subscribeOnUpdate(stream: Stream, handler: () => void) {
    const streamId = getStreamShortExternalId(stream);
    const handlers = this.onUpdateHandlers.get(streamId);
    if (!handlers) {
      this.onUpdateHandlers.set(streamId, new Subscriptions(handler));
    } else {
      handlers.add(handler);
    }
  }

  unsubscribeFromUpdate(stream: Stream, handler: () => void) {
    const streamId = getStreamShortExternalId(stream);
    const handlers = this.onUpdateHandlers.get(streamId);
    if (handlers) {
      handlers.remove(handler);
      if (handlers.isEmpty) this.onUpdateHandlers.delete(streamId);
    }
  }

  private fireOnUpdateSubscriptions(streamId: string) {
    this.onUpdateHandlers.get(streamId)?.fire();
  }

  public async destroy() {
    this.cache.clear();
    this.onUpdateHandlers.clear();
    this._isInitialized = false;
  }
}
