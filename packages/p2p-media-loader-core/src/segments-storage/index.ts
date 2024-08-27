import { CommonCoreConfig, StreamConfig, StreamType } from "../types.js";
/** Segments storage interface */
export interface SegmentsStorage {
  /**
   * Initializes storage
   * @param coreConfig - Storage configuration
   * @param mainStreamConfig - Main stream configuration
   * @param secondaryStreamConfig - Secondary stream configuration
   */
  initialize(
    coreConfig: CommonCoreConfig,
    mainStreamConfig: StreamConfig,
    secondaryStreamConfig: StreamConfig,
  ): Promise<void>;

  /**
   * Updates playback position
   * @param position - Playback position
   * @param rate - Playback rate
   */
  onPlaybackUpdated(position: number, rate: number): void;

  /**
   * Updates segment request information
   * @param streamId - Stream identifier
   * @param segmentId - Segment identifier
   * @param startTime - Segment start time
   * @param endTime - Segment end time
   */
  onSegmentRequested(
    streamId: string,
    segmentId: number,
    startTime: number,
    endTime: number,
  ): void;

  /**
   *  Stores segment data
   * @param streamId - Stream identifier
   * @param segmentId - Segment identifier
   * @param data - Segment data
   * @param startTime - Segment start time
   * @param endTime - Segment end time
   * @param streamType - Stream type
   * @param isLiveStream - Is live stream
   */
  storeSegment(
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
   * Returns segment IDs of a stream that are stored in the storage
   * @param streamId - Stream identifier
   */
  getStoredSegmentIds(streamId: string): number[];

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
