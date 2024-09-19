import { CommonCoreConfig, StreamConfig, StreamType } from "../types.js";
/** Segments storage interface */
export interface SegmentStorage {
  /**
   * Initializes storage
   * @param coreConfig - Core configuration with storage options
   * @param mainStreamConfig - Main stream configuration
   * @param secondaryStreamConfig - Secondary stream configuration
   */
  initialize(
    coreConfig: CommonCoreConfig,
    mainStreamConfig: StreamConfig,
    secondaryStreamConfig: StreamConfig,
  ): Promise<void>;

  /**
   * Provides playback position from player
   * @param position - Playback position
   * @param rate - Playback rate
   */
  onPlaybackUpdated(position: number, rate: number): void;

  /**
   * Provides segment request information from player
   * @param streamId - Stream identifier
   * @param segmentId - Segment identifier
   * @param startTime - Segment start time
   * @param endTime - Segment end time
   * @param swarmId - Swarm identifier
   * @param streamType - Stream type
   * @param isLiveStream - Is live stream
   */
  onSegmentRequested(
    streamId: string,
    segmentId: number,
    startTime: number,
    endTime: number,
    swarmId: string,
    streamType: StreamType,
    isLiveStream: boolean,
  ): void;

  /**
   * Stores segment data
   * @param streamId - Stream identifier
   * @param segmentId - Segment identifier
   * @param data - Segment data
   * @param startTime - Segment start time
   * @param endTime - Segment end time
   * @param swarmId - Swarm identifier
   * @param streamType - Stream type
   * @param isLiveStream - Is live stream
   */
  storeSegment(
    streamId: string,
    segmentId: number,
    data: ArrayBuffer,
    startTime: number,
    endTime: number,
    swarmId: string,
    streamType: StreamType,
    isLiveStream: boolean,
  ): Promise<void>;

  /**
   * Returns segment data
   * @param streamId - Stream identifier
   * @param segmentId - Segment identifier
   * @param swarmId - Swarm identifier
   */
  getSegmentData(
    streamId: string,
    segmentId: number,
    swarmId: string,
  ): Promise<ArrayBuffer | undefined>;

  /**
   * Returns used memory information in the storage
   */
  getUsedMemory(): {
    memoryLimit: number;
    memoryUsed: number;
  };

  /**
   * Returns true if segment is in storage
   * @param streamId - Stream identifier
   * @param segmentId - Segment identifier
   * @param swarmId - Swarm identifier
   */
  hasSegment(streamId: string, segmentId: number, swarmId: string): boolean;

  /**
   * Returns segment IDs of a stream that are stored in the storage
   * @param streamId - Stream identifier
   * @param swarmId - Swarm identifier
   */
  getStoredSegmentIds(streamId: string, swarmId: string): number[];

  /**
   * Sets event dispatcher for storage update
   * @param eventDispatcher - Event dispatcher
   */
  setUpdateEventDispatcher(eventDispatcher: (streamId: string) => void): void;

  /**
   * Function to destroy storage
   */
  destroy(): void;
}
