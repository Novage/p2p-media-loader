import { CommonCoreConfig, StreamConfig } from "./types.js";
import debug from "debug";
import { EventTarget } from "./utils/event-target.js";
import { ISegmentsStorage } from "./segments-storage/segments-storage.interface.js";

type SegmentDataItem = {
  segmentId: number;
  streamId: string;
  data: ArrayBuffer;
  startTime: number;
  endTime: number;
  streamType: string;
};

type StorageEventHandlers = {
  [key in `onStorageUpdated-${string}`]: () => void;
};

function getStorageItemId(streamId: string, segmentId: number) {
  return `${streamId}|${segmentId}`;
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
  private storageConfig?: CommonCoreConfig;
  private mainStreamConfig?: StreamConfig;
  private secondaryStreamConfig?: StreamConfig;
  private getCurrentPlaybackTime?: () => number;
  private getSegmentDuration?: () => { startTime: number; endTime: number };

  constructor() {
    this.logger = debug("p2pml-core:segment-memory-storage");
    this.logger.color = "RebeccaPurple";
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async initialize(
    storageConfig: CommonCoreConfig,
    mainStreamConfig: StreamConfig,
    secondaryStreamConfig: StreamConfig,
  ) {
    this.storageConfig = storageConfig;
    this.mainStreamConfig = mainStreamConfig;
    this.secondaryStreamConfig = secondaryStreamConfig;

    this._isInitialized = true;
    this.logger("initialized");
  }

  isInitialized(): boolean {
    return this._isInitialized;
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

  // eslint-disable-next-line @typescript-eslint/require-await
  async storeSegment(
    streamId: string,
    segmentId: number,
    data: ArrayBuffer,
    startTime: number,
    endTime: number,
    streamType: string,
    isLiveStream: boolean,
  ) {
    const storageId = getStorageItemId(streamId, segmentId);
    this.cache.set(storageId, {
      data,
      segmentId,
      streamId,
      startTime,
      endTime,
      streamType,
    });

    this.logger(`add segment: ${segmentId} to ${streamId}`);
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
    if (
      !this.getCurrentPlaybackTime ||
      !this.mainStreamConfig ||
      !this.secondaryStreamConfig ||
      !this.storageConfig
    ) {
      return false;
    }

    const currentPlayback = this.getCurrentPlaybackTime();
    const affectedStreams = new Set<string>();
    const maxStorageCapacity = isLiveStream
      ? Infinity
      : this.getStorageMaxCacheCount();

    if (
      !isLiveStream &&
      (maxStorageCapacity === 0 || this.cache.size <= maxStorageCapacity)
    ) {
      return false;
    }

    for (const [storageId, segmentData] of this.cache.entries()) {
      const { endTime, streamType, streamId } = segmentData;
      const highDemandTimeWindow = this.getHighDemandTimeWindow(streamType);

      let shouldRemove = false;

      if (isLiveStream) {
        shouldRemove = currentPlayback >= highDemandTimeWindow + endTime;
      } else {
        const httpDownloadTimeWindow =
          this.getHttpDownloadTimeWindow(streamType);
        shouldRemove =
          currentPlayback >= endTime + httpDownloadTimeWindow * 1.05;
      }

      if (shouldRemove) {
        this.logger(`remove segment: ${segmentData.segmentId}`);
        this.cache.delete(storageId);
        affectedStreams.add(streamId);
      }
    }

    affectedStreams.forEach((stream) =>
      this.dispatchStorageUpdatedEvent(stream),
    );

    return affectedStreams.size > 0;
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

  private getStorageMaxCacheCount() {
    if (
      !this.storageConfig ||
      !this.getSegmentDuration ||
      !this.mainStreamConfig ||
      !this.secondaryStreamConfig
    ) {
      return 0;
    }

    const cachedSegmentsCount = this.storageConfig.cachedSegmentsCount;
    if (cachedSegmentsCount === 0) return 0;

    const maxHttpTimeWindow =
      this.mainStreamConfig.httpDownloadTimeWindow >=
      this.secondaryStreamConfig.httpDownloadTimeWindow
        ? this.mainStreamConfig.httpDownloadTimeWindow
        : this.secondaryStreamConfig.httpDownloadTimeWindow;

    const { startTime, endTime } = this.getSegmentDuration();
    const segmentDuration = endTime - startTime;
    const segmentsInTimeWindow = Math.ceil(maxHttpTimeWindow / segmentDuration);

    const isCachedSegmentCountValid =
      cachedSegmentsCount >= segmentsInTimeWindow;

    return isCachedSegmentCountValid
      ? cachedSegmentsCount
      : segmentsInTimeWindow;
  }

  private dispatchStorageUpdatedEvent(streamId: string) {
    this.eventTarget.dispatchEvent(`onStorageUpdated-${streamId}`);
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

  public destroy() {
    this.cache.clear();
    this._isInitialized = false;
  }
}
