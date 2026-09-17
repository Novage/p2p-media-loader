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
  streamSwarmId: string;
  data: ArrayBuffer;
  startTime: number;
  endTime: number;
  streamType: StreamType;
};

type Playback = {
  position: number;
  rate: number;
};

const BYTES_PER_MiB = 1048576;

export class SegmentMemoryStorage implements SegmentStorage {
  private readonly userAgent = navigator.userAgent;
  private segmentMemoryStorageLimit = 4 * 1024;
  private currentStorageUsage = 0;

  private cache = new Map<string, SegmentDataItem>();
  private readonly logger: debug.Debugger;
  private coreConfig?: CommonCoreConfig;
  private mainStreamConfig?: StreamConfig;
  private secondaryStreamConfig?: StreamConfig;
  private currentPlayback?: Playback;
  /**
   * Whether the stream the player last asked a segment of is live, which is
   * what tells the retention rule to keep a trailing window. Undefined until
   * the first request, when there is no playhead to measure anything against
   * either.
   */
  private lastRequestedIsLive?: boolean;
  private segmentChangeCallback?: (streamSwarmId: string) => void;

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
    _swarmId: string,
    _streamSwarmId: string,
    _segmentId: number,
    _startTime: number,
    _endTime: number,
    _streamType: StreamType,
    isLiveStream: boolean,
  ): void {
    this.lastRequestedIsLive = isLiveStream;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async storeSegment(
    _swarmId: string,
    streamSwarmId: string,
    segmentId: number,
    data: ArrayBuffer,
    startTime: number,
    endTime: number,
    streamType: StreamType,
    isLiveStream: boolean,
  ) {
    this.clear(isLiveStream, data.byteLength);

    const storageId = getStorageItemId(streamSwarmId, segmentId);
    // Storing replaces, so what the entry held stops counting. The map is
    // idempotent under a repeated store and the byte count has to be too.
    const replaced = this.cache.get(storageId);
    if (replaced) this.decreaseStorageUsage(replaced.data.byteLength);

    this.cache.set(storageId, {
      data,
      segmentId,
      streamSwarmId,
      startTime,
      endTime,
      streamType,
    });
    this.increaseStorageUsage(data.byteLength);

    this.logger(`add segment: ${segmentId} to ${streamSwarmId}`);

    if (!this.segmentChangeCallback) {
      throw new Error("dispatchStorageUpdatedEvent is not set");
    }

    this.segmentChangeCallback(streamSwarmId);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSegmentData(
    _swarmId: string,
    streamSwarmId: string,
    segmentId: number,
  ) {
    const segmentStorageId = getStorageItemId(streamSwarmId, segmentId);
    const dataItem = this.cache.get(segmentStorageId);

    if (dataItem === undefined) return undefined;

    return dataItem.data;
  }

  getUsage() {
    if (this.lastRequestedIsLive === undefined || !this.currentPlayback) {
      return {
        totalCapacity: this.segmentMemoryStorageLimit,
        usedCapacity: this.currentStorageUsage,
      };
    }
    const playbackPosition = this.currentPlayback.position;
    const isLiveStream = this.lastRequestedIsLive;

    let calculatedUsedCapacity = 0;
    for (const segmentData of this.cache.values()) {
      if (!this.isRetained(segmentData, isLiveStream, playbackPosition)) {
        continue;
      }

      calculatedUsedCapacity += segmentData.data.byteLength;
    }

    return {
      totalCapacity: this.segmentMemoryStorageLimit,
      usedCapacity: calculatedUsedCapacity / BYTES_PER_MiB,
    };
  }

  hasSegment(_swarmId: string, streamSwarmId: string, externalId: number) {
    const segmentStorageId = getStorageItemId(streamSwarmId, externalId);
    const segment = this.cache.get(segmentStorageId);

    return segment !== undefined;
  }

  getStoredSegmentIds(_swarmId: string, streamSwarmId: string) {
    const externalIds: number[] = [];

    for (const {
      segmentId,
      streamSwarmId: streamCacheId,
    } of this.cache.values()) {
      if (streamCacheId !== streamSwarmId) continue;
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
      const { streamSwarmId, segmentId, data } = segmentData;
      const storageId = getStorageItemId(streamSwarmId, segmentId);

      if (
        this.isRetained(
          segmentData,
          isLiveStream,
          this.currentPlayback.position,
        )
      ) {
        continue;
      }

      this.cache.delete(storageId);
      affectedStreams.add(streamSwarmId);
      this.decreaseStorageUsage(data.byteLength);

      this.logger(`Removed segment ${segmentId} from stream ${streamSwarmId}`);

      if (!this.isMemoryLimitReached(newSegmentSize) && !isLiveStream) break;
    }

    this.sendUpdatesToAffectedStreams(affectedStreams);
  }

  private isMemoryLimitReached(segmentByteLength: number) {
    return (
      this.currentStorageUsage + segmentByteLength / BYTES_PER_MiB >
      this.segmentMemoryStorageLimit
    );
  }

  setSegmentChangeCallback(
    callback: ((streamSwarmId: string) => void) | undefined,
  ) {
    this.segmentChangeCallback = callback;
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

  /**
   * Whether the cache has to keep this segment: everything the playhead has
   * not passed, and on live the trailing window as well, so a viewer who
   * pauses or steps back a little still finds it there.
   *
   * Eviction frees what this refuses to keep and `getUsage` reports what it
   * keeps as occupied, so the brake on prefetching is measured against the
   * same rule that decides what can be freed. Reporting only the bytes ahead
   * of the playhead would leave a live stream's retained trailing window
   * invisible: unfreeable capacity that the brake would treat as free.
   */
  private isRetained(
    segmentData: SegmentDataItem,
    isLiveStream: boolean,
    currentPlaybackPosition: number,
  ): boolean {
    const { endTime, streamType } = segmentData;

    if (currentPlaybackPosition <= endTime) return true;
    if (!isLiveStream) return false;

    const highDemandTimeWindow = this.getStreamTimeWindow(
      streamType,
      "highDemandTimeWindow",
    );

    return currentPlaybackPosition <= highDemandTimeWindow + endTime;
  }

  private increaseStorageUsage(segmentByteLength: number) {
    this.currentStorageUsage += segmentByteLength / BYTES_PER_MiB;
  }

  private decreaseStorageUsage(segmentByteLength: number) {
    this.currentStorageUsage -= segmentByteLength / BYTES_PER_MiB;
  }

  private setMemoryStorageLimit() {
    if (this.coreConfig?.segmentMemoryStorageLimit) {
      this.segmentMemoryStorageLimit =
        this.coreConfig.segmentMemoryStorageLimit;
      return;
    }

    if (isAndroidWebview(this.userAgent) || isIPadOrIPhone(this.userAgent)) {
      this.segmentMemoryStorageLimit = 1024;
    } else if (isAndroid(this.userAgent)) {
      this.segmentMemoryStorageLimit = 2 * 1024;
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
    this.segmentChangeCallback = undefined;
  }
}
