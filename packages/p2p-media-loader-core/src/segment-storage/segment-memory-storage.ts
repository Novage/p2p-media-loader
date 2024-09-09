import { CommonCoreConfig, StreamConfig, StreamType } from "../types.js";
import debug from "debug";
import { EventTarget } from "../utils/event-target.js";
import { SegmentStorage } from "./index.js";

type SegmentDataItem = {
  segmentId: number;
  streamId: string;
  data: ArrayBuffer;
  startTime: number;
  endTime: number;
  streamType: string;
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

type StorageEventHandlers = {
  [key in `onStorageUpdated-${string}`]: () => void;
};

function getStorageItemId(streamId: string, segmentId: number) {
  return `${streamId}|${segmentId}`;
}

export class SegmentMemoryStorage implements SegmentStorage {
  private cache = new Map<string, SegmentDataItem>();
  private readonly logger: debug.Debugger;
  private readonly eventTarget = new EventTarget<StorageEventHandlers>();
  private storageConfig?: CommonCoreConfig;
  private mainStreamConfig?: StreamConfig;
  private secondaryStreamConfig?: StreamConfig;
  private currentPlayback?: Playback;
  private lastRequestedSegment?: LastRequestedSegmentInfo;

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

    this.logger("initialized");
  }

  onPlaybackUpdated(position: number, rate: number) {
    this.currentPlayback = { position, rate };
  }

  onSegmentRequested(
    streamId: string,
    segmentId: number,
    startTime: number,
    endTime: number,
    _swarmId: string,
    _streamType: StreamType,
    _isLiveStream: boolean,
  ): void {
    this.lastRequestedSegment = {
      streamId,
      segmentId,
      startTime,
      endTime,
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async storeSegment(
    streamId: string,
    segmentId: number,
    data: ArrayBuffer,
    startTime: number,
    endTime: number,
    _swarmId: string,
    streamType: StreamType,
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
  async getSegmentData(streamId: string, segmentId: number, _swarmId: string) {
    const segmentStorageId = getStorageItemId(streamId, segmentId);
    const dataItem = this.cache.get(segmentStorageId);

    if (dataItem === undefined) return undefined;

    return dataItem.data;
  }

  hasSegment(streamId: string, externalId: number, _swarmId: string) {
    const segmentStorageId = getStorageItemId(streamId, externalId);
    const segment = this.cache.get(segmentStorageId);

    return segment !== undefined;
  }

  getStoredSegmentIds(streamId: string, _swarmId: string) {
    const externalIds: number[] = [];

    for (const { segmentId, streamId: streamCacheId } of this.cache.values()) {
      if (streamCacheId !== streamId) continue;
      externalIds.push(segmentId);
    }

    return externalIds;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async clear(isLiveStream: boolean) {
    if (
      !this.currentPlayback ||
      !this.mainStreamConfig ||
      !this.secondaryStreamConfig ||
      !this.storageConfig
    ) {
      return false;
    }

    const currentPlayback = this.currentPlayback.position;
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
      const highDemandTimeWindow = this.getStreamTimeWindow(
        streamType,
        "highDemandTimeWindow",
      );

      let shouldRemove = false;

      if (isLiveStream) {
        shouldRemove = currentPlayback > highDemandTimeWindow + endTime;
      } else {
        const httpDownloadTimeWindow = this.getStreamTimeWindow(
          streamType,
          "httpDownloadTimeWindow",
        );
        shouldRemove =
          currentPlayback > endTime + httpDownloadTimeWindow * 1.05;
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
      !this.lastRequestedSegment ||
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

    const { startTime, endTime } = this.lastRequestedSegment;
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

  public destroy() {
    this.cache.clear();
  }
}
