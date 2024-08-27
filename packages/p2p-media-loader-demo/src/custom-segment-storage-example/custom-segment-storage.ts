import {
  CommonCoreConfig,
  SegmentsStorage,
  StreamConfig,
} from "p2p-media-loader-core";
import { P2PLoaderIndexedDB } from "./p2ploader-db";

type StorageEventHandlers = {
  [key in `onStorageUpdated-${string}`]: () => void;
};

type SegmentDataItem = {
  storageId: string;
  data: ArrayBuffer;
};

type Playback = {
  position: number;
  rate: number;
};

type LastRequestedSegmentInfo = {
  streamId: string;
  segmentId: number;
  startTime: number;
  endTime: number;
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

export class CustomSegmentStorage implements SegmentsStorage {
  private storageSegmentsCount = 0;
  private storageConfig?: CommonCoreConfig;
  private mainStreamConfig?: StreamConfig;
  private secondaryStreamConfig?: StreamConfig;
  private cacheMap = new Map<string, Map<number, SegmentInfoItem>>();
  private readonly eventTarget = new EventTarget<StorageEventHandlers>();
  private currentPlayback?: Playback;
  private lastRequestedSegmentInfo?: LastRequestedSegmentInfo;
  private dbWrapper: P2PLoaderIndexedDB;

  constructor() {
    this.dbWrapper = new P2PLoaderIndexedDB(
      DB_NAME,
      DB_VERSION,
      INFO_ITEMS_STORE_NAME,
      DATA_ITEMS_STORE_NAME,
    );
  }

  onPlaybackUpdated(position: number, rate: number): void {
    this.currentPlayback = { position, rate };
  }

  onSegmentRequested(
    streamId: string,
    segmentId: number,
    startTime: number,
    endTime: number,
  ): void {
    this.lastRequestedSegmentInfo = {
      streamId,
      segmentId,
      startTime,
      endTime,
    };
  }

  async initialize(
    storageConfig: CommonCoreConfig,
    mainStreamConfig: StreamConfig,
    secondaryStreamConfig: StreamConfig,
  ) {
    this.storageConfig = storageConfig;
    this.mainStreamConfig = mainStreamConfig;
    this.secondaryStreamConfig = secondaryStreamConfig;

    // await this.dbWrapper.deleteDatabase();
    await this.dbWrapper.openDatabase();
    await this.loadCacheMap();
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
      this.dbWrapper.put(DATA_ITEMS_STORE_NAME, segmentDataItem),
      this.dbWrapper.put(INFO_ITEMS_STORE_NAME, segmentInfoItem),
    ]);

    this.dispatchStorageUpdatedEvent(segmentInfoItem.streamId);
    void this.clear(segmentInfoItem.streamId);
  }

  async getSegmentData(
    streamId: string,
    segmentId: number,
  ): Promise<ArrayBuffer | undefined> {
    const segmentStorageId = getStorageItemId(streamId, segmentId);
    const result = await this.dbWrapper.get<SegmentDataItem>(
      DATA_ITEMS_STORE_NAME,
      segmentStorageId,
    );

    return result?.data;
  }

  hasSegment(streamId: string, segmentId: number): boolean {
    const streamCache = this.cacheMap.get(streamId);
    return streamCache?.has(segmentId) ?? false;
  }

  getStoredSegmentIds(streamId: string): number[] {
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
    this.dbWrapper.closeDatabase();
    this.cacheMap.clear();
  }

  private dispatchStorageUpdatedEvent(streamId: string) {
    this.eventTarget.dispatchEvent(`onStorageUpdated-${streamId}`);
  }

  private async loadCacheMap() {
    const result = await this.dbWrapper.getAll<SegmentInfoItem>(
      INFO_ITEMS_STORE_NAME,
    );

    result.forEach((item) => {
      if (!this.cacheMap.has(item.streamId)) {
        this.cacheMap.set(item.streamId, new Map<number, SegmentInfoItem>());
      }
      this.cacheMap.get(item.streamId)?.set(item.segmentId, item);
      this.storageSegmentsCount++;
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
      !this.currentPlayback
    ) {
      return;
    }
    const cachedSegmentsCount = this.storageConfig.cachedSegmentsCount;
    if (this.storageSegmentsCount + 1 <= cachedSegmentsCount) return;

    const currentPlaybackPosition = this.currentPlayback.position;
    const affectedStreams = new Set<string>();
    const segmentsStorageIdsToRemove: string[] = [];

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
        currentPlaybackPosition -
          (httpDownloadTimeWindow - highDemandTimeWindow) * 1.05;

      if (isPastThreshold) {
        this.storageSegmentsCount--;
        streamCache.delete(segmentInfoItem.segmentId);
        segmentsStorageIdsToRemove.push(storageId);
        affectedStreams.add(streamId);
      }
    };

    const streamCache = this.cacheMap.get(activeStreamId);
    if (!streamCache) return;

    streamCache.forEach((segmentInfoItem) =>
      tryRemoveSegment(segmentInfoItem, streamCache),
    );

    if (segmentsStorageIdsToRemove.length === 0) {
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
    segmentsStorageIds: string[],
  ): Promise<void> {
    const promises = segmentsStorageIds.flatMap((storageId) => [
      this.dbWrapper.delete(DATA_ITEMS_STORE_NAME, storageId),
      this.dbWrapper.delete(INFO_ITEMS_STORE_NAME, storageId),
    ]);
    await Promise.all(promises);
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
