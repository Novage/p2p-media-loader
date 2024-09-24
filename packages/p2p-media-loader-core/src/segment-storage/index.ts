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
   * @param swarmId - Swarm identifier
   * @param streamId - Stream identifier
   * @param segmentId - Segment identifier
   * @param startTime - Segment start time
   * @param endTime - Segment end time
   * @param streamType - Stream type
   * @param isLiveStream - Is live stream
   */
  onSegmentRequested(
    swarmId: string,
    streamId: string,
    segmentId: number,
    startTime: number,
    endTime: number,
    streamType: StreamType,
    isLiveStream: boolean,
  ): void;

  /**
   * Stores segment data
   * @param swarmId - Swarm identifier
   * @param streamId - Stream identifier
   * @param segmentId - Segment identifier
   * @param data - Segment data
   * @param startTime - Segment start time
   * @param endTime - Segment end time
   * @param streamType - Stream type
   * @param isLiveStream - Is live stream
   */
  storeSegment(
    swarmId: string,
    streamId: string,
    segmentId: number,
    data: ArrayBuffer,
    startTime: number,
    endTime: number,
    streamType: StreamType,
    isLiveStream: boolean,
  ): Promise<void>;

  /**
   * Returns segment data
   * @param swarmId - Swarm identifier
   * @param streamId - Stream identifier
   * @param segmentId - Segment identifier
   */
  getSegmentData(
    swarmId: string,
    streamId: string,
    segmentId: number,
  ): Promise<ArrayBuffer | undefined>;

  /**
   * Returns used memory information in the storage
   */
  getUsage(): {
    totalCapacity: number;
    usedCapacity: number;
  };

  /**
   * Returns true if segment is in storage
   * @param swarmId - Swarm identifier
   * @param streamId - Stream identifier
   * @param segmentId - Segment identifier
   */
  hasSegment(swarmId: string, streamId: string, segmentId: number): boolean;

  /**
   * Returns segment IDs of a stream that are stored in the storage
   * @param swarmId - Swarm identifier
   * @param streamId - Stream identifier
   */
  getStoredSegmentIds(swarmId: string, streamId: string): number[];

  /**
   * Sets segment change callback function
   * @param callback - Callback function that has to be called when segments appear or disappear in the storage
   */
  setSegmentChangeCallback(callback: (streamId: string) => void): void;

  /**
   * Function to destroy storage
   */
  destroy(): void;
}
