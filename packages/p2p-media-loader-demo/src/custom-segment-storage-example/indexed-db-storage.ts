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
  streamSwarmId: string;
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
  streamSwarmId: string;
  segmentId: number;
  streamType: string;
  startTime: number;
  endTime: number;
  swarmId: string;
};

function getStorageItemId(streamSwarmId: string, segmentId: number) {
  return `${streamSwarmId}|${segmentId}`;
}

const INFO_ITEMS_STORE_NAME = "segmentInfo";
const DATA_ITEMS_STORE_NAME = "segmentData";
const DB_NAME = "p2p-media-loader";
// Version 2: the persisted segment info field streamId was renamed to
// streamSwarmId. Bump on every change to the persisted record shape — the
// upgrade handler drops and recreates the stores (cached data is disposable).
const DB_VERSION = 2;
const BYTES_PER_MB = 1048576;

export class IndexedDbStorage implements SegmentStorage {
  private segmentsMemoryStorageLimit = 4096; // memory storage limit in MiB
  private currentMemoryStorageSize = 0; // current memory storage size in MiB

  private storageConfig?: CommonCoreConfig;
  private mainStreamConfig?: StreamConfig;
  private secondaryStreamConfig?: StreamConfig;
  private cache = new Map<string, SegmentInfoItem>();

  // The position the core reports: the start of the segment the player
  // requested last, on the manifest timeline — where the player's buffer
  // ends, not its playhead — and the playback rate.
  private currentPlayback?: Playback;
  private lastRequestedSegment?: LastRequestedSegmentInfo; // details  about the last requested segment by the player
  private db: IndexedDbWrapper;

  private segmentChangeCallback?: (streamSwarmId: string) => void;

  constructor() {
    this.db = new IndexedDbWrapper(
      DB_NAME,
      DB_VERSION,
      INFO_ITEMS_STORE_NAME,
      DATA_ITEMS_STORE_NAME,
    );
  }

  onPlaybackUpdated(position: number, rate: number) {
    this.currentPlayback = { position, rate };
  }

  onSegmentRequested(
    swarmId: string,
    streamSwarmId: string,
    segmentId: number,
    startTime: number,
    endTime: number,
    streamType: StreamType,
    isLiveStream: boolean,
  ) {
    this.lastRequestedSegment = {
      streamSwarmId,
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
    swarmId: string,
    streamSwarmId: string,
    segmentId: number,
    data: ArrayBuffer,
    startTime: number,
    endTime: number,
    streamType: StreamType,
    _isLiveStream: boolean,
  ) {
    const storageId = getStorageItemId(streamSwarmId, segmentId);
    const segmentDataItem = {
      storageId,
      data,
    };
    const segmentInfoItem = {
      storageId,
      dataLength: data.byteLength,
      streamSwarmId,
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

      if (this.segmentChangeCallback) {
        this.segmentChangeCallback(streamSwarmId);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to store segment ${segmentId}:`, error);
      throw error;
    }
  }

  async getSegmentData(
    _swarmId: string,
    streamSwarmId: string,
    segmentId: number,
  ) {
    const segmentStorageId = getStorageItemId(streamSwarmId, segmentId);
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

  hasSegment(_swarmId: string, streamSwarmId: string, segmentId: number) {
    const storageId = getStorageItemId(streamSwarmId, segmentId);
    return this.cache.has(storageId);
  }

  getStoredSegmentIds(_swarmId: string, streamSwarmId: string) {
    const storedSegments: number[] = [];

    for (const segment of this.cache.values()) {
      if (segment.streamSwarmId === streamSwarmId) {
        storedSegments.push(segment.segmentId);
      }
    }

    return storedSegments;
  }

  destroy() {
    this.db.closeDatabase();
    this.cache.clear();
  }

  setSegmentChangeCallback(callback: (streamSwarmId: string) => void) {
    this.segmentChangeCallback = callback;
  }

  private async loadCacheMap() {
    const result = await this.db.getAll<SegmentInfoItem>(INFO_ITEMS_STORE_NAME);

    result.forEach((item) => {
      const storageId = getStorageItemId(item.streamSwarmId, item.segmentId);
      this.cache.set(storageId, item);

      this.increaseMemoryStorageSize(item.dataLength);
    });
  }

  private increaseMemoryStorageSize(dataLength: number) {
    this.currentMemoryStorageSize += dataLength / BYTES_PER_MB;
  }
}
