import {
  CommonCoreConfig,
  SegmentStorage,
  StreamConfig,
  StreamType,
} from "p2p-media-loader-core";
import { IndexedDbWrapper } from "./indexed-db-wrapper";

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

export class IndexedDbStorage implements SegmentStorage {
  private segmentsMemoryStorageLimit = 4000; // 4 GB
  private currentMemoryStorageSize = 0; // current memory storage size in MB

  private storageConfig?: CommonCoreConfig;
  private mainStreamConfig?: StreamConfig;
  private secondaryStreamConfig?: StreamConfig;
  private cache = new Map<string, SegmentInfoItem>();

  private currentPlayback?: Playback; // current playback position and rate
  private lastRequestedSegment?: LastRequestedSegmentInfo; // details  about the last requested segment by the player
  private db: IndexedDbWrapper;

  private dispatchStorageUpdatedEvent?: (streamId: string) => void;

  constructor() {
    this.db = new IndexedDbWrapper(
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

    try {
      // await this.db.deleteDatabase();
      await this.db.openDatabase();
      await this.loadCacheMap();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to initialize custom segment storage:", error);
      throw error;
    }
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

    try {
      /*
       * await this.clear();
       * Implement your own logic to remove old segments and manage the memory storage size
       */

      await Promise.all([
        this.db.put(DATA_ITEMS_STORE_NAME, segmentDataItem),
        this.db.put(INFO_ITEMS_STORE_NAME, segmentInfoItem),
      ]);

      this.cache.set(storageId, segmentInfoItem);
      this.increaseMemoryStorageSize(data.byteLength);

      if (this.dispatchStorageUpdatedEvent) {
        this.dispatchStorageUpdatedEvent(streamId);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to store segment ${segmentId}:`, error);
      throw error;
      // Optionally, implement retry logic or other error recovery mechanisms
    }
  }

  async getSegmentData(
    streamId: string,
    segmentId: number,
  ): Promise<ArrayBuffer | undefined> {
    const segmentStorageId = getStorageItemId(streamId, segmentId);
    try {
      const result = await this.db.get<SegmentDataItem>(
        DATA_ITEMS_STORE_NAME,
        segmentStorageId,
      );

      return result?.data;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Error retrieving segment data for ${segmentStorageId}:`,
        error,
      );
      return undefined;
    }
  }

  getUsage() {
    /*
     * Implement your own logic to calculate the memory used by the segments stored in memory.
     */
    return {
      totalCapacity: this.segmentsMemoryStorageLimit,
      usedCapacity: this.currentMemoryStorageSize,
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
}
