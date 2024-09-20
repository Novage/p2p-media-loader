import { CommonCoreConfig, StreamConfig, StreamType } from "../types.js";
import debug from "debug";
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
  swarmId: string;
  streamType: StreamType;
  isLiveStream: boolean;
};

const getStorageItemId = (streamId: string, segmentId: number) =>
  `${streamId}|${segmentId}`;

const isAndroid = (ua: string) => /Android/i.test(ua);

const isIPadOrIPhone = (ua: string) => /iPad|iPhone/i.test(ua);

const isAndroidWebview = (ua: string) =>
  /Android/i.test(ua) && !/Chrome|Firefox/i.test(ua);

const BYTES_PER_MB = 1048576;

export class SegmentMemoryStorage implements SegmentStorage {
  private readonly userAgent = navigator.userAgent;
  private segmentsMemoryStorageLimit = 4000;
  private currentMemoryStorageSize = 0;

  private cache = new Map<string, SegmentDataItem>();
  private readonly logger: debug.Debugger;
  private coreConfig?: CommonCoreConfig;
  private mainStreamConfig?: StreamConfig;
  private secondaryStreamConfig?: StreamConfig;
  private currentPlayback?: Playback;
  private lastRequestedSegment?: LastRequestedSegmentInfo;
  private dispatchStorageUpdatedEvent?: (streamId: string) => void;

  constructor() {
    this.logger = debug("p2pml-core:segment-memory-storage");
    this.logger.color = "RebeccaPurple";
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async initialize(
    coreConfig: CommonCoreConfig,
    mainStreamConfig: StreamConfig,
    secondaryStreamConfig: StreamConfig,
  ) {
    this.coreConfig = coreConfig;
    this.mainStreamConfig = mainStreamConfig;
    this.secondaryStreamConfig = secondaryStreamConfig;

    this.setMemoryStorageLimit();
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
    swarmId: string,
    streamType: StreamType,
    isLiveStream: boolean,
  ): void {
    this.lastRequestedSegment = {
      streamId,
      segmentId,
      startTime,
      endTime,
      swarmId,
      streamType,
      isLiveStream,
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
    void this.clear(isLiveStream, data.byteLength);

    const storageId = getStorageItemId(streamId, segmentId);
    this.cache.set(storageId, {
      data,
      segmentId,
      streamId,
      startTime,
      endTime,
      streamType,
    });
    this.updateMemoryStorageSize(data.byteLength, true);

    this.logger(`add segment: ${segmentId} to ${streamId}`);

    if (!this.dispatchStorageUpdatedEvent) {
      throw new Error("dispatchStorageUpdatedEvent is not set");
    }

    this.dispatchStorageUpdatedEvent(streamId);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSegmentData(streamId: string, segmentId: number, _swarmId: string) {
    const segmentStorageId = getStorageItemId(streamId, segmentId);
    const dataItem = this.cache.get(segmentStorageId);

    if (dataItem === undefined) return undefined;

    return dataItem.data;
  }

  getUsedMemory() {
    if (!this.lastRequestedSegment || !this.currentPlayback) {
      return {
        memoryLimit: this.segmentsMemoryStorageLimit,
        memoryUsed: this.currentMemoryStorageSize,
      };
    }
    const PlaybackPosition = this.currentPlayback.position;

    let potentialFreeSpace = 0;
    for (const segmentData of this.cache.values()) {
      const { endTime } = segmentData;

      if (PlaybackPosition <= endTime) continue;

      potentialFreeSpace += segmentData.data.byteLength / BYTES_PER_MB;
    }

    const usedMemoryInMB =
      this.currentMemoryStorageSize - potentialFreeSpace / BYTES_PER_MB;

    return {
      memoryLimit: this.segmentsMemoryStorageLimit,
      memoryUsed: usedMemoryInMB,
    };
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
  private async clear(isLiveStream: boolean, newSegmentSize: number) {
    if (
      !this.currentPlayback ||
      !this.mainStreamConfig ||
      !this.secondaryStreamConfig ||
      !this.coreConfig
    ) {
      return;
    }

    const isMemoryLimitReached = this.isMemoryLimitReached(newSegmentSize);

    if (!isMemoryLimitReached && !isLiveStream) return;

    const affectedStreams = new Set<string>();
    const sortedCache = Array.from(this.cache.values()).sort(
      (a, b) => a.startTime - b.startTime,
    );

    for (const segmentData of sortedCache) {
      const { streamId, segmentId } = segmentData;
      const storageId = getStorageItemId(streamId, segmentId);

      const shouldRemove = this.shouldRemoveSegment(
        segmentData,
        isLiveStream,
        this.currentPlayback.position,
      );

      if (!shouldRemove) continue;

      this.cache.delete(storageId);
      this.updateMemoryStorageSize(segmentData.data.byteLength);
      affectedStreams.add(streamId);
      this.logger(`Removed segment ${segmentId} from stream ${streamId}`);

      if (!this.isMemoryLimitReached(newSegmentSize) && !isLiveStream) break;
    }

    this.sendUpdatesToAffectedStreams(affectedStreams);
  }

  private isMemoryLimitReached(segmentByteLength: number) {
    return (
      this.currentMemoryStorageSize + segmentByteLength / BYTES_PER_MB >
      this.segmentsMemoryStorageLimit
    );
  }

  setUpdateEventDispatcher(eventDispatcher: (streamId: string) => void) {
    this.dispatchStorageUpdatedEvent = eventDispatcher;
  }

  private sendUpdatesToAffectedStreams(affectedStreams: Set<string>) {
    if (affectedStreams.size === 0) return;

    affectedStreams.forEach((stream) => {
      if (!this.dispatchStorageUpdatedEvent) {
        throw new Error("dispatchStorageUpdatedEvent is not set");
      }

      this.dispatchStorageUpdatedEvent(stream);
    });
  }

  private updateMemoryStorageSize(
    byteLength: number,
    isAddition: boolean = false,
  ): void {
    const changeInMB = byteLength / BYTES_PER_MB;

    if (isAddition) {
      this.currentMemoryStorageSize += changeInMB;
    } else {
      this.currentMemoryStorageSize -= changeInMB;
    }
  }

  private shouldRemoveSegment(
    segmentData: SegmentDataItem,
    isLiveStream: boolean,
    currentPlaybackPosition: number,
  ): boolean {
    const { endTime, streamType } = segmentData;
    const highDemandTimeWindow = this.getStreamTimeWindow(
      streamType,
      "highDemandTimeWindow",
    );

    if (currentPlaybackPosition <= endTime) return false;

    if (isLiveStream) {
      if (currentPlaybackPosition > highDemandTimeWindow + endTime) {
        return true;
      }
      return false;
    }

    return true;
  }

  private setMemoryStorageLimit() {
    if (this.coreConfig && this.coreConfig.segmentsMemoryStorageLimit) {
      this.segmentsMemoryStorageLimit =
        this.coreConfig.segmentsMemoryStorageLimit;
      return;
    }

    if (isAndroidWebview(this.userAgent) || isIPadOrIPhone(this.userAgent)) {
      this.segmentsMemoryStorageLimit = 1000;
    } else if (isAndroid(this.userAgent)) {
      this.segmentsMemoryStorageLimit = 2000;
    }
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
