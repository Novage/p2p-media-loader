import {
  CommonCoreConfig,
  ISegmentsStorage,
  StreamConfig,
} from "p2p-media-loader-core";

type StorageEventHandlers = {
  [key in `onStorageUpdated-${string}`]: () => void;
};

type SegmentDataItem = {
  storageId: string;
  data: ArrayBuffer;
};

type SegmentInfoItem = {
  storageId: string;
  streamId: string;
  segmentId: number;
  streamType: string;
  startTime: number;
  endTime: number;
};

function getStorageItemId(streamId: string, segmentId: number) {
  return `${streamId}|${segmentId}`;
}

const INFO_ITEMS_STORE_NAME = "segmentInfo";
const DATA_ITEMS_STORE_NAME = "segmentData";
const DB_NAME = "p2p-media-loader";
const DB_VERSION = 1;

export class CustomSegmentStorage implements ISegmentsStorage {
  private initialized = false;
  private storageSegmentsCount = 0;
  private storageConfig?: CommonCoreConfig;
  private mainStreamConfig?: StreamConfig;
  private secondaryStreamConfig?: StreamConfig;
  private db?: IDBDatabase;
  private cacheMap = new Map<string, Map<number, SegmentInfoItem>>();
  private readonly eventTarget = new EventTarget<StorageEventHandlers>();
  private getCurrentPlaybackTime?: () => number;
  private getLastRequestedSegmentDuration?: () => {
    startTime: number;
    endTime: number;
  };

  async initialize(
    storageConfig: CommonCoreConfig,
    mainStreamConfig: StreamConfig,
    secondaryStreamConfig: StreamConfig,
  ) {
    this.storageConfig = storageConfig;
    this.mainStreamConfig = mainStreamConfig;
    this.secondaryStreamConfig = secondaryStreamConfig;

    try {
      // await this.deleteDatabase("p2p-media-loader");
      await this.openDb();
      await this.loadCacheMap();

      this.initialized = true;
    } catch (error) {
      this.initialized = false;
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async storeSegment(
    streamId: string,
    segmentId: number,
    data: ArrayBuffer,
    startTime: number,
    endTime: number,
    streamType: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _isLiveStream: boolean,
  ): Promise<void> {
    const storageId = getStorageItemId(streamId, segmentId);
    const segmentDataItem = {
      storageId,
      data,
    };
    const segmentInfoItem = {
      storageId,
      streamId,
      segmentId,
      streamType,
      startTime,
      endTime,
    };

    this.updateCacheMap(segmentInfoItem);

    await Promise.all([
      this.saveInObjectStore(DATA_ITEMS_STORE_NAME, segmentDataItem),
      this.saveInObjectStore(INFO_ITEMS_STORE_NAME, segmentInfoItem),
    ]);

    this.dispatchStorageUpdatedEvent(segmentInfoItem.streamId);
    void this.clear(segmentInfoItem.streamId);
  }

  setSegmentPlaybackCallback(getCurrentPlaybackTime: () => number) {
    this.getCurrentPlaybackTime = getCurrentPlaybackTime;
  }

  setLastRequestedSegmentDurationCallback(
    getLastRequestedSegmentDuration: () => {
      startTime: number;
      endTime: number;
    },
  ) {
    this.getLastRequestedSegmentDuration = getLastRequestedSegmentDuration;
  }

  async getSegmentData(
    streamId: string,
    segmentId: number,
  ): Promise<ArrayBuffer | undefined> {
    if (!this.db) {
      throw new Error("Database is not initialized.");
    }

    const segmentStorageId = getStorageItemId(streamId, segmentId);
    const transaction = this.db.transaction(DATA_ITEMS_STORE_NAME, "readonly");
    const objectStore = transaction.objectStore(DATA_ITEMS_STORE_NAME);

    const result = await new Promise<ArrayBuffer | undefined>(
      (resolve, reject) => {
        const request = objectStore.get(segmentStorageId);

        request.onsuccess = (event) => {
          const storageDataItem = (
            event.target as IDBRequest<SegmentDataItem | undefined>
          ).result;

          if (!storageDataItem) {
            resolve(undefined);
            return;
          }

          resolve(storageDataItem.data);
        };

        request.onerror = () => {
          reject(new Error("Failed to retrieve segment data."));
        };
      },
    );

    return result;
  }

  hasSegment(streamId: string, segmentId: number): boolean {
    const streamCache = this.cacheMap.get(streamId);
    return streamCache?.has(segmentId) ?? false;
  }

  getStoredSegmentExternalIdsOfStream(streamId: string): number[] {
    const streamCache = this.cacheMap.get(streamId);
    if (!streamCache) return [];

    return Array.from(streamCache.keys(), (key) => key);
  }

  subscribeOnUpdate(streamId: string, listener: () => void): void {
    this.eventTarget.addEventListener(`onStorageUpdated-${streamId}`, listener);
  }

  unsubscribeFromUpdate(streamId: string, listener: () => void): void {
    this.eventTarget.removeEventListener(
      `onStorageUpdated-${streamId}`,
      listener,
    );
  }

  destroy() {
    if (!this.db) {
      throw new Error("Database is not initialized.");
    }

    this.db.close();
    this.initialized = false;
    this.cacheMap.clear();
  }

  private dispatchStorageUpdatedEvent(streamId: string) {
    this.eventTarget.dispatchEvent(`onStorageUpdated-${streamId}`);
  }

  private openDb() {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(new Error("Failed to open database."));

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = () => {
        this.db = request.result;
        if (!this.db) return;

        if (
          !this.db.objectStoreNames.contains(DATA_ITEMS_STORE_NAME) &&
          !this.db.objectStoreNames.contains(INFO_ITEMS_STORE_NAME)
        ) {
          this.createObjectStores(this.db);
        }
      };
    });
  }

  private createObjectStores(db: IDBDatabase): void {
    db.createObjectStore(DATA_ITEMS_STORE_NAME, {
      keyPath: "storageId",
    });
    db.createObjectStore(INFO_ITEMS_STORE_NAME, {
      keyPath: "storageId",
    });
  }

  private loadCacheMap() {
    if (!this.db) {
      throw new Error("Database is not initialized.");
    }

    const transaction = this.db.transaction(INFO_ITEMS_STORE_NAME, "readonly");
    const objectStore = transaction.objectStore(INFO_ITEMS_STORE_NAME);

    return new Promise<void>((resolve, reject) => {
      const request = objectStore.getAll();

      request.onsuccess = (event) => {
        const result = (event.target as IDBRequest<SegmentInfoItem[]>).result;

        result.forEach((item) => {
          if (!this.cacheMap.has(item.streamId)) {
            this.cacheMap.set(
              item.streamId,
              new Map<number, SegmentInfoItem>(),
            );
          }
          this.cacheMap.get(item.streamId)?.set(item.segmentId, item);
          this.storageSegmentsCount++;
        });

        resolve();
      };

      request.onerror = () => {
        reject(new Error("Failed to load cache map."));
      };
    });
  }

  private saveInObjectStore(
    storeName: string,
    itemToStore: SegmentInfoItem | SegmentDataItem,
  ) {
    if (!this.db) {
      throw new Error("Database is not initialized.");
    }

    const transaction = this.db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    return new Promise<void>((resolve, reject) => {
      const request = store.put(itemToStore);

      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(new Error(`Failed to store item in ${storeName}.`));
    });
  }

  private updateCacheMap(segmentInfoItem: SegmentInfoItem) {
    if (!this.cacheMap.has(segmentInfoItem.streamId)) {
      this.cacheMap.set(
        segmentInfoItem.streamId,
        new Map<number, SegmentInfoItem>(),
      );
    }

    const streamCache = this.cacheMap.get(segmentInfoItem.streamId);
    streamCache?.set(segmentInfoItem.segmentId, segmentInfoItem);
  }

  private async clear(activeStreamId: string) {
    if (
      !this.storageConfig ||
      !this.mainStreamConfig ||
      !this.secondaryStreamConfig ||
      !this.getCurrentPlaybackTime ||
      !this.getLastRequestedSegmentDuration
    ) {
      return;
    }
    const cachedSegmentsCount = this.storageConfig.cachedSegmentsCount;
    if (this.storageSegmentsCount + 1 <= cachedSegmentsCount) return;

    const currentPlayback = this.getCurrentPlaybackTime();
    const affectedStreams = new Set<string>();
    const segmentsStorageIdsToRemove = new Set<string>();

    const tryRemoveSegment = (
      segmentInfoItem: SegmentInfoItem,
      streamCache: Map<number, SegmentInfoItem>,
    ) => {
      const { streamType, endTime, streamId, storageId } = segmentInfoItem;

      const httpDownloadTimeWindow = this.getStreamTimeWindow(
        streamType,
        "httpDownloadTimeWindow",
      );
      const highDemandTimeWindow = this.getStreamTimeWindow(
        streamType,
        "highDemandTimeWindow",
      );

      const isPastThreshold =
        endTime <
        currentPlayback -
          (httpDownloadTimeWindow - highDemandTimeWindow) * 1.05;

      if (isPastThreshold) {
        this.storageSegmentsCount--;
        streamCache.delete(segmentInfoItem.segmentId);
        segmentsStorageIdsToRemove.add(storageId);
        affectedStreams.add(streamId);
      }
    };

    const streamCache = this.cacheMap.get(activeStreamId);
    if (!streamCache) return;

    streamCache.forEach((segmentInfoItem) =>
      tryRemoveSegment(segmentInfoItem, streamCache),
    );

    if (segmentsStorageIdsToRemove.size === 0) {
      for (const [streamId, streamCache] of this.cacheMap) {
        if (streamId === activeStreamId) continue;
        streamCache.forEach((segmentInfoItem) =>
          tryRemoveSegment(segmentInfoItem, streamCache),
        );
      }
    }

    await this.removeSegmentsFromStorage(segmentsStorageIdsToRemove);

    affectedStreams.forEach((stream) =>
      this.dispatchStorageUpdatedEvent(stream),
    );
  }

  private async removeSegmentsFromStorage(
    segmentsStorageIds: Set<string>,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.db) {
        throw new Error("Database is not initialized.");
      }

      const transaction = this.db.transaction(
        [DATA_ITEMS_STORE_NAME, INFO_ITEMS_STORE_NAME],
        "readwrite",
      );
      const dataStore = transaction.objectStore(DATA_ITEMS_STORE_NAME);
      const infoStore = transaction.objectStore(INFO_ITEMS_STORE_NAME);

      segmentsStorageIds.forEach((storageId) => {
        dataStore.delete(storageId);
        infoStore.delete(storageId);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(new Error("Failed to delete segments from storage."));
    });
  }

  private async deleteDatabase(dbName: string) {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Failed to delete database."));
    });
  }

  private getStreamTimeWindow(
    streamType: string,
    configKey: "highDemandTimeWindow" | "httpDownloadTimeWindow",
  ): number {
    if (!this.mainStreamConfig || !this.secondaryStreamConfig) {
      return 0;
    }

    const config =
      streamType === "main"
        ? this.mainStreamConfig
        : this.secondaryStreamConfig;
    return config[configKey];
  }
}

class EventTarget<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  EventTypesMap extends { [key: string]: (...args: any[]) => unknown },
> {
  private events = new Map<
    keyof EventTypesMap,
    EventTypesMap[keyof EventTypesMap][]
  >();

  public dispatchEvent<K extends keyof EventTypesMap>(
    eventName: K,
    ...args: Parameters<EventTypesMap[K]>
  ) {
    const listeners = this.events.get(eventName);
    if (!listeners) return;
    for (const listener of listeners) {
      listener(...args);
    }
  }

  public getEventDispatcher<K extends keyof EventTypesMap>(eventName: K) {
    let listeners = this.events.get(eventName);
    if (!listeners) {
      listeners = [];
      this.events.set(eventName, listeners);
    }

    const definedListeners = listeners;

    return (...args: Parameters<EventTypesMap[K]>) => {
      for (const listener of definedListeners) {
        listener(...args);
      }
    };
  }

  public addEventListener<K extends keyof EventTypesMap>(
    eventName: K,
    listener: EventTypesMap[K],
  ) {
    const listeners = this.events.get(eventName);
    if (!listeners) {
      this.events.set(eventName, [listener]);
    } else {
      listeners.push(listener);
    }
  }

  public removeEventListener<K extends keyof EventTypesMap>(
    eventName: K,
    listener: EventTypesMap[K],
  ) {
    const listeners = this.events.get(eventName);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }
}
