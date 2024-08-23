import { CommonCoreConfig, StreamConfig } from "../types.js";
/** Segments storage interface */
export interface ISegmentsStorage {
  /**
   * Initializes storage
   * @param storageConfig - Storage configuration
   * @param mainStreamConfig - Main stream configuration
   * @param secondaryStreamConfig - Secondary stream configuration
   */
  initialize(
    storageConfig: CommonCoreConfig,
    mainStreamConfig: StreamConfig,
    secondaryStreamConfig: StreamConfig,
  ): Promise<void>;

  /** Returns true if storage is initialized */
  isInitialized(): boolean;

  /**
   * Sets callback to get current playback time
   * @param getCurrentPlaybackTime - Callback to get current playback time
   */
  setSegmentPlaybackCallback(getCurrentPlaybackTime: () => number): void;

  /**
   * Sets callback to get last requested segment duration
   * @param getLastRequestedSegmentDuration - Callback to get last requested segment duration
   */
  setLastRequestedSegmentDurationCallback(
    getLastRequestedSegmentDuration: () => {
      startTime: number;
      endTime: number;
    },
  ): void;

  /**
   *  Stores segment data
   *
   * @param streamId - Stream identifier
   * @param segmentId - Segment identifier
   * @param data - Segment data
   * @param startTime - Segment start time
   * @param endTime - Segment end time
   * @param streamType - stream type
   * @param isLiveStream - Is live stream
   */
  storeSegment(
    streamId: string,
    segmentId: number,
    data: ArrayBuffer,
    startTime: number,
    endTime: number,
    streamType: string,
    isLiveStream: boolean,
  ): Promise<void>;

  /**
   * Returns segment data
   * @param streamId - Stream identifier
   * @param segmentId - Segment identifier
   */
  getSegmentData(
    streamId: string,
    segmentId: number,
  ): Promise<ArrayBuffer | undefined>;

  /**
   * Returns true if segment is in storage
   * @param streamId - Stream identifier
   * @param segmentId - Segment identifier
   */
  hasSegment(streamId: string, segmentId: number): boolean;

  /**
   * Returns segment Ids of stream that are stored in storage
   * @param streamId - Stream identifier
   */
  getStoredSegmentExternalIdsOfStream(streamId: string): number[];

  /**
   * Function to subscribe on stream updates
   * @param streamId - Stream identifier
   * @param listener - Listener
   */
  subscribeOnUpdate(streamId: string, listener: () => void): void;

  /**
   * Function to unsubscribe from stream updates
   * @param streamId - Stream identifier
   * @param listener - Listener
   */
  unsubscribeFromUpdate(streamId: string, listener: () => void): void;

  /**
   * Function to destroy storage
   */
  destroy(): void;
}
