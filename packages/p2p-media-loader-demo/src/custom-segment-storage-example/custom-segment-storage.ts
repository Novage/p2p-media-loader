import {
  CommonCoreConfig,
  SegmentStorage,
  StreamConfig,
  StreamType,
} from "p2p-media-loader-core";
import { P2PLoaderIndexedDB } from "./p2p-db";

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
  swarmId: string;
  streamType: StreamType;
  isLiveStream: boolean;
};

type SegmentInfoItem = {
  storageId: string;
  dataLength: number;
  streamId: string;
  segmentId: number;
  streamType: string;
  startTime: number;
  endTime: number;
  swarmId: string;
};

function getStorageItemId(streamId: string, segmentId: number) {
  return `${streamId}|${segmentId}`;
}

const INFO_ITEMS_STORE_NAME = "segmentInfo";
const DATA_ITEMS_STORE_NAME = "segmentData";
const DB_NAME = "p2p-media-loader";
const DB_VERSION = 1;
const BYTES_PER_MB = 1048576;

export class CustomSegmentStorage implements SegmentStorage {
  private segmentsMemoryStorageLimit = 100;
  private currentMemoryStorageSize = 0;

  private storageConfig?: CommonCoreConfig;
  private mainStreamConfig?: StreamConfig;
  private secondaryStreamConfig?: StreamConfig;
  private cache = new Map<string, SegmentInfoItem>();

  private currentPlayback?: Playback;
  private lastRequestedSegment?: LastRequestedSegmentInfo;
  private db: P2PLoaderIndexedDB;

  private dispatchStorageUpdatedEvent?: (streamId: string) => void;

  constructor() {
    this.db = new P2PLoaderIndexedDB(
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

  async initialize(
    storageConfig: CommonCoreConfig,
    mainStreamConfig: StreamConfig,
    secondaryStreamConfig: StreamConfig,
  ) {
    this.storageConfig = storageConfig;
    this.mainStreamConfig = mainStreamConfig;
    this.secondaryStreamConfig = secondaryStreamConfig;

    await this.db.deleteDatabase();
    await this.db.openDatabase();
    await this.loadCacheMap();
  }

  async storeSegment(
    streamId: string,
    segmentId: number,
    data: ArrayBuffer,
    startTime: number,
    endTime: number,
    swarmId: string,
    streamType: StreamType,
    _isLiveStream: boolean,
  ): Promise<void> {
    const storageId = getStorageItemId(streamId, segmentId);
    const segmentDataItem = {
      storageId,
      data,
    };
    const segmentInfoItem = {
      storageId,
      dataLength: data.byteLength,
      streamId,
      segmentId,
      streamType,
      startTime,
      endTime,
      swarmId,
    };

    await this.clear(swarmId, data.byteLength);
    await Promise.all([
      this.db.put(DATA_ITEMS_STORE_NAME, segmentDataItem),
      this.db.put(INFO_ITEMS_STORE_NAME, segmentInfoItem),
    ]);

    console.log(`Stored segment ${segmentId}`);

    this.cache.set(storageId, segmentInfoItem);
    this.increaseMemoryStorageSize(data.byteLength);

    if (this.dispatchStorageUpdatedEvent) {
      this.dispatchStorageUpdatedEvent(streamId);
    }
  }

  async getSegmentData(
    streamId: string,
    segmentId: number,
  ): Promise<ArrayBuffer | undefined> {
    const segmentStorageId = getStorageItemId(streamId, segmentId);
    const result = await this.db.get<SegmentDataItem>(
      DATA_ITEMS_STORE_NAME,
      segmentStorageId,
    );

    return result?.data;
  }

  getUsedMemory() {
    const defaultUsedMemory = {
      memoryLimit: this.segmentsMemoryStorageLimit,
      memoryUsed: this.currentMemoryStorageSize,
    };

    if (!this.lastRequestedSegment || !this.currentPlayback) {
      return defaultUsedMemory;
    }

    const playbackPosition = this.currentPlayback.position;
    const currentSwarmId = this.lastRequestedSegment.swarmId;

    let potentialFreeMemory = 0;
    for (const segment of this.cache.values()) {
      if (
        segment.swarmId !== currentSwarmId ||
        playbackPosition > segment.endTime
      ) {
        potentialFreeMemory += segment.dataLength;
      }
    }

    const potentialFreeMemoryInMB = potentialFreeMemory / BYTES_PER_MB;
    const usedMemoryInMB =
      this.currentMemoryStorageSize - potentialFreeMemoryInMB;

    console.log("potentialFreeMemory", potentialFreeMemoryInMB);
    console.log("currentMemoryStorageSize", usedMemoryInMB);

    return {
      memoryLimit: this.segmentsMemoryStorageLimit,
      memoryUsed: usedMemoryInMB,
    };
  }

  hasSegment(streamId: string, segmentId: number): boolean {
    const storageId = getStorageItemId(streamId, segmentId);
    return this.cache.has(storageId);
  }

  getStoredSegmentIds(streamId: string): number[] {
    const storedSegments: number[] = [];

    for (const segment of this.cache.values()) {
      if (segment.streamId === streamId) {
        storedSegments.push(segment.segmentId);
      }
    }

    return storedSegments;
  }

  destroy() {
    this.db.closeDatabase();
    this.cache.clear();
  }

  setUpdateEventDispatcher(eventDispatcher: (streamId: string) => void) {
    this.dispatchStorageUpdatedEvent = eventDispatcher;
  }

  private async loadCacheMap() {
    const result = await this.db.getAll<SegmentInfoItem>(INFO_ITEMS_STORE_NAME);

    result.forEach((item) => {
      const storageId = getStorageItemId(item.streamId, item.segmentId);
      this.cache.set(storageId, item);

      this.increaseMemoryStorageSize(item.dataLength);
    });
  }

  private increaseMemoryStorageSize(dataLength: number) {
    this.currentMemoryStorageSize += dataLength / BYTES_PER_MB;
  }

  private decreaseMemoryStorageSize(dataLength: number) {
    this.currentMemoryStorageSize -= dataLength / BYTES_PER_MB;
  }

  private async clear(swarmId: string, newSegmentSize: number) {
    if (
      !this.storageConfig ||
      !this.mainStreamConfig ||
      !this.secondaryStreamConfig ||
      !this.currentPlayback
    ) {
      return;
    }

    const playbackPosition = this.currentPlayback.position;
    const affectedStreams = new Set<string>();

    if (!this.isMemoryLimitReached(newSegmentSize)) return;

    const segmentsInCurrentSwarm: SegmentInfoItem[] = [];
    const otherSegments: SegmentInfoItem[] = [];

    for (const segment of this.cache.values()) {
      if (segment.swarmId === swarmId && playbackPosition > segment.endTime) {
        segmentsInCurrentSwarm.push(segment);
      } else {
        otherSegments.push(segment);
      }
    }

    if (otherSegments.length !== 0) {
      const memoryFreed = await this.removeSegments(
        otherSegments,
        affectedStreams,
        newSegmentSize,
      );

      if (memoryFreed) {
        this.sendUpdatesToAffectedStreams(affectedStreams);
        return;
      }
    }

    const sortedSegments = segmentsInCurrentSwarm.sort(
      (a, b) => a.endTime - b.endTime,
    );

    await this.removeSegments(sortedSegments, affectedStreams, newSegmentSize);

    this.sendUpdatesToAffectedStreams(affectedStreams);
  }

  private async removeSegments(
    segments: SegmentInfoItem[],
    affectedStreams: Set<string>,
    newSegmentSize: number,
  ) {
    for (const segment of segments) {
      try {
        await this.removeSegmentFromStorage(segment.storageId);
        this.cache.delete(segment.storageId);
        this.decreaseMemoryStorageSize(segment.dataLength);
        affectedStreams.add(segment.streamId);
        console.log(`Removed segment ${segment.segmentId}`);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Failed to remove segment ${segment.storageId}:`, error);
      }

      if (!this.isMemoryLimitReached(newSegmentSize)) {
        break;
      }
    }

    return !this.isMemoryLimitReached(newSegmentSize);
  }

  private isMemoryLimitReached(segmentByteLength: number) {
    return (
      this.currentMemoryStorageSize + segmentByteLength / BYTES_PER_MB >
      this.segmentsMemoryStorageLimit
    );
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

  private async removeSegmentFromStorage(storageId: string): Promise<void> {
    await this.db.delete(DATA_ITEMS_STORE_NAME, storageId);
    await this.db.delete(INFO_ITEMS_STORE_NAME, storageId);
  }
}
