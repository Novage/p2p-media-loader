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
};

function getStorageItemId(streamId: string, segmentId: number) {
  return `${streamId}|${segmentId}`;
}

function isAndroid(ua: string) {
  return /Android/i.test(ua);
}

function isIPadOrIPhone(ua: string) {
  return /iPad|iPhone/i.test(ua);
}

function isWkWebviewOnIPadOrIPhone(ua: string) {
  return /\b(iPad|iPhone).*AppleWebKit(?!.*Safari)/i.test(ua);
}

function isAndroidWebview(ua: string) {
  return /Android/i.test(ua) && !/Chrome|Firefox/i.test(ua);
}

const firstNonEmpty = (...arrays: string[][]) =>
  arrays.find((arr) => arr.length > 0) ?? [];

export class SegmentMemoryStorage implements SegmentStorage {
  private readonly userAgent = navigator.userAgent;
  private segmentsMemoryStorageLimit = 4000;
  private currentMemoryStorageSize = 0;
  private lastStoredSegmentSize = 0;

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
    const segmentDataInMB = data.byteLength / 1048576;
    void this.clear(isLiveStream, segmentDataInMB);

    const storageId = getStorageItemId(streamId, segmentId);
    this.cache.set(storageId, {
      data,
      segmentId,
      streamId,
      startTime,
      endTime,
      streamType,
    });

    this.currentMemoryStorageSize += segmentDataInMB;

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
  private async clear(isLiveStream: boolean, segmentDataInMB: number) {
    if (
      !this.currentPlayback ||
      !this.mainStreamConfig ||
      !this.secondaryStreamConfig ||
      !this.coreConfig
    ) {
      return false;
    }

    const isMemoryLimitReached =
      this.currentMemoryStorageSize + segmentDataInMB >=
      this.segmentsMemoryStorageLimit;

    if (!isMemoryLimitReached) return;

    const affectedStreams = new Set<string>();
    const segmentsToRemove = this.findSegmentsToRemove(isLiveStream);

    for (const segmentId of segmentsToRemove) {
      const segmentData = this.cache.get(segmentId);
      if (!segmentData) continue;

      this.cache.delete(segmentId);
      this.currentMemoryStorageSize -= segmentData.data.byteLength / 1048576;
      this.logger(
        `remove segment: ${segmentData.segmentId} from ${segmentData.streamId}`,
      );

      affectedStreams.add(segmentData.streamId);
    }

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

  private findSegmentsToRemove(isLiveStream: boolean = false) {
    if (
      !this.currentPlayback ||
      !this.mainStreamConfig ||
      !this.secondaryStreamConfig ||
      !this.coreConfig
    ) {
      return [];
    }

    const segmentsToRemove: string[] = [];
    const halfSegmentsBehindPlayback: string[] = [];
    const allSegmentsBehindPlayback: string[] = [];
    const segmentsAheadOfPlayback: string[] = [];

    const currentPlayback = this.currentPlayback.position;

    for (const [storageId, segmentData] of this.cache.entries()) {
      const { endTime, streamType } = segmentData;
      const highDemandTimeWindow = this.getStreamTimeWindow(
        streamType,
        "highDemandTimeWindow",
      );
      const httpDownloadTimeWindow = this.getStreamTimeWindow(
        streamType,
        "httpDownloadTimeWindow",
      );

      if (isLiveStream && currentPlayback > highDemandTimeWindow + endTime) {
        segmentsToRemove.push(storageId);
        continue;
      }

      if (currentPlayback > endTime + httpDownloadTimeWindow * 0.95) {
        segmentsToRemove.push(storageId);
      }
      if (currentPlayback > endTime + httpDownloadTimeWindow * 0.5) {
        halfSegmentsBehindPlayback.push(storageId);
      }
      if (currentPlayback > endTime) {
        allSegmentsBehindPlayback.push(storageId);
      }
      if (endTime > currentPlayback + httpDownloadTimeWindow) {
        segmentsAheadOfPlayback.push(storageId);
      }
    }

    if (isLiveStream) return segmentsToRemove;
    if (segmentsToRemove.length > 0) return segmentsToRemove;

    return firstNonEmpty(
      halfSegmentsBehindPlayback,
      allSegmentsBehindPlayback,
      segmentsAheadOfPlayback,
    );
  }

  private setMemoryStorageLimit() {
    if (this.coreConfig && this.coreConfig.segmentsMemoryStorageLimit) {
      this.segmentsMemoryStorageLimit =
        this.coreConfig.segmentsMemoryStorageLimit;
      return;
    }

    if (
      isAndroidWebview(this.userAgent) ||
      isWkWebviewOnIPadOrIPhone(this.userAgent) ||
      isIPadOrIPhone(this.userAgent)
    ) {
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
