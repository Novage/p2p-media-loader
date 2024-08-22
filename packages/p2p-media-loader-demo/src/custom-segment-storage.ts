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

function getStorageItemId(streamSwarmId: string, externalId: number) {
  return `${streamSwarmId}|${externalId}`;
}

const INFO_ITEMS_STORE_NAME = "segmentInfo";
const DATA_ITEMS_STORE_NAME = "segmentData";

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
  private getSegmentDuration?: () => { startTime: number; endTime: number };

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
    await this.saveInObjectStore(DATA_ITEMS_STORE_NAME, segmentDataItem);
    await this.saveInObjectStore(INFO_ITEMS_STORE_NAME, segmentInfoItem);

    this.dispatchStorageUpdatedEvent(segmentInfoItem.streamId);
    void this.clear(segmentInfoItem.streamId);
  }

  setSegmentPlaybackCallback(getCurrentPlaybackTime: () => number) {
    this.getCurrentPlaybackTime = getCurrentPlaybackTime;
  }

  setEngineRequestSegmentDurationCallback(
    getSegmentDurationFromEngineRequest: () => {
      startTime: number;
      endTime: number;
    },
  ) {
    this.getSegmentDuration = getSegmentDurationFromEngineRequest;
  }

  getSegmentData(
    streamId: string,
    segmentId: number,
  ): Promise<ArrayBuffer | undefined> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database is not initialized."));
        return;
      }

      const segmentStorageId = getStorageItemId(streamId, segmentId);
      const transaction = this.db.transaction(
        DATA_ITEMS_STORE_NAME,
        "readonly",
      );
      const objectStore = transaction.objectStore(DATA_ITEMS_STORE_NAME);
      const request = objectStore.get(segmentStorageId);

      request.onsuccess = (event) => {
        const result = (event.target as IDBRequest<SegmentDataItem | undefined>)
          .result;

        if (!result) {
          resolve(undefined);
          return;
        }

        resolve(result.data);
      };

      request.onerror = () => {
        reject(new Error("Failed to retrieve segment data."));
      };
    });
  }

  hasSegment(streamSwarmId: string, externalId: number): boolean {
    const streamCache = this.cacheMap.get(streamSwarmId);

    const doesExist =
      streamCache === undefined ? false : streamCache.has(externalId);

    return doesExist;
  }

  getStoredSegmentExternalIdsOfStream(streamSwarmId: string): number[] {
    const streamCache = this.cacheMap.get(streamSwarmId);
    const externalIds: number[] = [];

    if (streamCache === undefined) return externalIds;

    for (const [, segment] of streamCache) {
      externalIds.push(segment.segmentId);
    }

    return externalIds;
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

  destroy(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database is not initialized."));
        return;
      }

      this.db.close();
      this.initialized = false;
      this.cacheMap.clear();

      resolve();
    });
  }

  private dispatchStorageUpdatedEvent(streamId: string) {
    this.eventTarget.dispatchEvent(`onStorageUpdated-${streamId}`);
  }

  private openDb() {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("p2p-media-loader", 1);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;

        if (
          this.db &&
          this.db.objectStoreNames.contains(DATA_ITEMS_STORE_NAME) &&
          this.db.objectStoreNames.contains(INFO_ITEMS_STORE_NAME)
        ) {
          resolve();
        }

        resolve();
      };

      request.onupgradeneeded = () => {
        this.db = request.result;
        if (!this.db) return;

        if (
          !this.db.objectStoreNames.contains(DATA_ITEMS_STORE_NAME) &&
          !this.db.objectStoreNames.contains(INFO_ITEMS_STORE_NAME)
        ) {
          const segmentDataStore = this.db.createObjectStore(
            DATA_ITEMS_STORE_NAME,
            {
              keyPath: "storageId",
            },
          );
          segmentDataStore.createIndex("storageId", "storageId", {
            unique: true,
          });

          const segmentInfoStore = this.db.createObjectStore(
            INFO_ITEMS_STORE_NAME,
            {
              keyPath: "storageId",
            },
          );
          segmentInfoStore.createIndex("storageId", "storageId", {
            unique: true,
          });
        }
      };
    });
  }

  private loadCacheMap() {
    return new Promise<void>((resolve, reject) => {
      if (!this.db) {
        throw new Error("Database is not initialized.");
      }

      const transaction = this.db.transaction(
        INFO_ITEMS_STORE_NAME,
        "readonly",
      );
      const objectStore = transaction.objectStore(INFO_ITEMS_STORE_NAME);

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
        reject("Failed to retrieve segment information.");
      };
    });
  }

  private saveInObjectStore(
    storeName: string,
    itemToStore: SegmentInfoItem | SegmentDataItem,
  ) {
    return new Promise<void>((resolve, reject) => {
      if (!this.db) {
        throw new Error("Database is not initialized.");
      }

      const transaction = this.db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.put(itemToStore);

      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(new Error(`Failed to store item in ${storeName}.`));
    });
  }

  private deleteFromObjectStore(storeName: string, storageId: string) {
    return new Promise<void>((resolve, reject) => {
      if (!this.db) {
        throw new Error("Database is not initialized.");
      }

      const transaction = this.db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.delete(storageId);

      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(new Error(`Failed to delete item from ${storeName}.`));
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
      !this.getSegmentDuration
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

      const httpDownloadTimeWindow = this.getHttpDownloadTimeWindow(streamType);
      const highDemandTimeWindow = this.getHighDemandTimeWindow(streamType);

      const isPastThreshold =
        endTime <
        currentPlayback - (httpDownloadTimeWindow - highDemandTimeWindow);

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

  private async removeSegmentsFromStorage(segmentsStorageIds: Set<string>) {
    for (const storageId of segmentsStorageIds) {
      await this.deleteFromObjectStore(DATA_ITEMS_STORE_NAME, storageId);
      await this.deleteFromObjectStore(INFO_ITEMS_STORE_NAME, storageId);
    }
  }

  private async deleteDatabase(dbName: string) {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private getHighDemandTimeWindow(streamType: string) {
    if (!this.mainStreamConfig || !this.secondaryStreamConfig) {
      return 0;
    }

    return streamType === "main"
      ? this.mainStreamConfig.highDemandTimeWindow
      : this.secondaryStreamConfig.highDemandTimeWindow;
  }

  private getHttpDownloadTimeWindow(streamType: string) {
    if (!this.mainStreamConfig || !this.secondaryStreamConfig) {
      return 0;
    }

    return streamType === "main"
      ? this.mainStreamConfig.httpDownloadTimeWindow
      : this.secondaryStreamConfig.httpDownloadTimeWindow;
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
