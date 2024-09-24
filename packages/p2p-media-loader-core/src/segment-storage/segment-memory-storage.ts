import { CommonCoreConfig, StreamConfig, StreamType } from "../types.js";
import debug from "debug";
import { SegmentStorage } from "./index.js";
import {
  isAndroid,
  isIPadOrIPhone,
  isAndroidWebview,
  getStorageItemId,
} from "./utils.js";

type SegmentDataItem = {
  segmentId: number;
  streamId: string;
  data: ArrayBuffer;
  startTime: number;
  endTime: number;
  streamType: StreamType;
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

const BYTES_PER_MiB = 1048576;

export class SegmentMemoryStorage implements SegmentStorage {
  private readonly userAgent = navigator.userAgent;
  private segmentMemoryStorageLimit = 4000;
  private currentMemoryStorageSize = 0;

  private cache = new Map<string, SegmentDataItem>();
  private readonly logger: debug.Debugger;
  private coreConfig?: CommonCoreConfig;
  private mainStreamConfig?: StreamConfig;
  private secondaryStreamConfig?: StreamConfig;
  private currentPlayback?: Playback;
  private lastRequestedSegment?: LastRequestedSegmentInfo;
  private segmentChangeCallback?: (streamId: string) => void;

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
    swarmId: string,
    streamId: string,
    segmentId: number,
    startTime: number,
    endTime: number,
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
    _swarmId: string,
    streamId: string,
    segmentId: number,
    data: ArrayBuffer,
    startTime: number,
    endTime: number,
    streamType: StreamType,
    isLiveStream: boolean,
  ) {
    this.clear(isLiveStream, data.byteLength);

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

    if (!this.segmentChangeCallback) {
      throw new Error("dispatchStorageUpdatedEvent is not set");
    }

    this.segmentChangeCallback(streamId);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSegmentData(streamId: string, segmentId: number, _swarmId: string) {
    const segmentStorageId = getStorageItemId(streamId, segmentId);
    const dataItem = this.cache.get(segmentStorageId);

    if (dataItem === undefined) return undefined;

    return dataItem.data;
  }

  getUsage() {
    if (!this.lastRequestedSegment || !this.currentPlayback) {
      return {
        totalCapacity: this.segmentMemoryStorageLimit,
        usedCapacity: this.currentMemoryStorageSize,
      };
    }
    const playbackPosition = this.currentPlayback.position;

    let calculatedUsedCapacity = 0;
    for (const { endTime, data } of this.cache.values()) {
      if (playbackPosition > endTime) continue;

      calculatedUsedCapacity += data.byteLength;
    }

    return {
      totalCapacity: this.segmentMemoryStorageLimit,
      usedCapacity: calculatedUsedCapacity / BYTES_PER_MiB,
    };
  }

  hasSegment(_swarmId: string, streamId: string, externalId: number) {
    const segmentStorageId = getStorageItemId(streamId, externalId);
    const segment = this.cache.get(segmentStorageId);

    return segment !== undefined;
  }

  getStoredSegmentIds(_swarmId: string, streamId: string) {
    const externalIds: number[] = [];

    for (const { segmentId, streamId: streamCacheId } of this.cache.values()) {
      if (streamCacheId !== streamId) continue;
      externalIds.push(segmentId);
    }

    return externalIds;
  }

  private clear(isLiveStream: boolean, newSegmentSize: number) {
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
      affectedStreams.add(streamId);
      this.logger(`Removed segment ${segmentId} from stream ${streamId}`);

      if (!this.isMemoryLimitReached(newSegmentSize) && !isLiveStream) break;
    }

    this.sendUpdatesToAffectedStreams(affectedStreams);
  }

  private isMemoryLimitReached(segmentByteLength: number) {
    return (
      this.currentMemoryStorageSize + segmentByteLength / BYTES_PER_MiB >
      this.segmentMemoryStorageLimit
    );
  }

  setSegmentChangeCallback(eventDispatcher: (streamId: string) => void) {
    this.segmentChangeCallback = eventDispatcher;
  }

  private sendUpdatesToAffectedStreams(affectedStreams: Set<string>) {
    if (affectedStreams.size === 0) return;

    affectedStreams.forEach((stream) => {
      if (!this.segmentChangeCallback) {
        throw new Error("dispatchStorageUpdatedEvent is not set");
      }

      this.segmentChangeCallback(stream);
    });
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
      return currentPlaybackPosition > highDemandTimeWindow + endTime;
    }

    return true;
  }

  private setMemoryStorageLimit() {
    if (this.coreConfig && this.coreConfig.segmentMemoryStorageLimit) {
      this.segmentMemoryStorageLimit =
        this.coreConfig.segmentMemoryStorageLimit;
      return;
    }

    if (isAndroidWebview(this.userAgent) || isIPadOrIPhone(this.userAgent)) {
      this.segmentMemoryStorageLimit = 1000;
    } else if (isAndroid(this.userAgent)) {
      this.segmentMemoryStorageLimit = 2000;
    }
  }

  private getStreamTimeWindow(
    streamType: string,
    configKey: "highDemandTimeWindow" | "httpDownloadTimeWindow",
  ): number {
    const config =
      streamType === "main"
        ? this.mainStreamConfig
        : this.secondaryStreamConfig;

    return config?.[configKey] ?? 0;
  }

  public destroy() {
    this.cache.clear();
  }
}
