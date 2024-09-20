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

type ObsoleteSegments = {
  live: string[];
  vod: string[];
  vodDifferentQuality: string[];
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
    void this.clear(isLiveStream, data.byteLength, streamId);

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
    if (!this.lastRequestedSegment) {
      return {
        memoryLimit: this.segmentsMemoryStorageLimit,
        memoryUsed: this.currentMemoryStorageSize,
      };
    }
    const { streamId, isLiveStream } = this.lastRequestedSegment;
    const segmentsToRemove = this.findSegmentsToRemove(isLiveStream, streamId);

    const potentialFreeSpace = segmentsToRemove.reduce((total, segmentId) => {
      const segment = this.cache.get(segmentId);
      return segment ? total + segment.data.byteLength : total;
    }, 0);

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
  private async clear(
    isLiveStream: boolean,
    segmentByteLength: number,
    streamId: string,
  ) {
    if (
      !this.currentPlayback ||
      !this.mainStreamConfig ||
      !this.secondaryStreamConfig ||
      !this.coreConfig
    ) {
      return false;
    }

    const isMemoryLimitReached =
      this.currentMemoryStorageSize + segmentByteLength / BYTES_PER_MB >
      this.segmentsMemoryStorageLimit;

    if (!isMemoryLimitReached && !isLiveStream) return;

    const segmentsToRemove = this.findSegmentsToRemove(isLiveStream, streamId);
    const affectedStreams = this.removeSegmentsFromCache(segmentsToRemove);

    this.sendUpdatesToAffectedStreams(affectedStreams);
  }

  setUpdateEventDispatcher(eventDispatcher: (streamId: string) => void) {
    this.dispatchStorageUpdatedEvent = eventDispatcher;
  }

  private sendUpdatesToAffectedStreams(affectedStreams: Set<string>) {
    affectedStreams.forEach((stream) => {
      if (!this.dispatchStorageUpdatedEvent) {
        throw new Error("dispatchStorageUpdatedEvent is not set");
      }

      this.dispatchStorageUpdatedEvent(stream);
    });
  }

  private removeSegmentsFromCache(segmentsToRemove: string[]) {
    const affectedStreams = new Set<string>();

    for (const segmentId of segmentsToRemove) {
      const segmentData = this.cache.get(segmentId);
      if (!segmentData) continue;

      this.cache.delete(segmentId);
      this.updateMemoryStorageSize(segmentData.data.byteLength);

      this.logger(
        `remove segment: ${segmentData.segmentId} from ${segmentData.streamId}`,
      );

      affectedStreams.add(segmentData.streamId);
    }

    return affectedStreams;
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

  private findSegmentsToRemove(
    isLiveStream: boolean = false,
    currentStreamId: string,
  ) {
    if (
      !this.currentPlayback ||
      !this.mainStreamConfig ||
      !this.secondaryStreamConfig ||
      !this.coreConfig
    ) {
      return [];
    }

    const obsoleteSegments: ObsoleteSegments = {
      live: [],
      vod: [],
      vodDifferentQuality: [],
    };
    const playbackPosition = this.currentPlayback.position;

    for (const segmentData of this.cache.values()) {
      const { streamId, segmentId, endTime, streamType } = segmentData;
      const storageId = getStorageItemId(streamId, segmentId);
      const highDemandTimeWindow = this.getStreamTimeWindow(
        streamType,
        "highDemandTimeWindow",
      );

      if (playbackPosition <= endTime) continue;

      if (isLiveStream) {
        if (playbackPosition > endTime + highDemandTimeWindow) {
          obsoleteSegments.live.push(storageId);
        }
        continue;
      }

      if (streamId !== currentStreamId) {
        obsoleteSegments.vodDifferentQuality.push(storageId);
        continue;
      }

      obsoleteSegments.vod.push(storageId);
    }

    if (obsoleteSegments.live.length > 0) return obsoleteSegments.live;
    if (obsoleteSegments.vodDifferentQuality.length > 0) {
      return obsoleteSegments.vodDifferentQuality;
    }
    return obsoleteSegments.vod;
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
