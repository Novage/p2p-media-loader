import { CommonCoreConfig, StreamConfig, StreamType } from "../types.js";
/** The interface for segment storage. */
export interface SegmentStorage {
  /**
   * Initializes the storage.
   * @param coreConfig The core configuration containing storage options.
   * @param mainStreamConfig The configuration for the main stream.
   * @param secondaryStreamConfig The configuration for the secondary stream.
   */
  initialize(
    coreConfig: CommonCoreConfig,
    mainStreamConfig: StreamConfig,
    secondaryStreamConfig: StreamConfig,
  ): Promise<void>;

  /**
   * Updates the storage with the current playback position from the player.
   * @param position The current playback position.
   * @param rate The current playback rate.
   */
  onPlaybackUpdated(position: number, rate: number): void;

  /**
   * Provides the storage with information about a segment requested by the player.
   * @param swarmId The swarm identifier.
   * @param streamId The stream identifier.
   * @param segmentId The segment identifier.
   * @param startTime The start time of the segment.
   * @param endTime The end time of the segment.
   * @param streamType The type of the stream.
   * @param isLiveStream Indicates whether the stream is live.
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
   * Stores the data for a specific segment.
   * @param swarmId The swarm identifier.
   * @param streamId The stream identifier.
   * @param segmentId The segment identifier.
   * @param data The segment data to store.
   * @param startTime The start time of the segment.
   * @param endTime The end time of the segment.
   * @param streamType The type of the stream.
   * @param isLiveStream Indicates whether the stream is live.
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
   * Retrieves the data for a specific segment.
   * @param swarmId The swarm identifier.
   * @param streamId The stream identifier.
   * @param segmentId The segment identifier.
   */
  getSegmentData(
    swarmId: string,
    streamId: string,
    segmentId: number,
  ): Promise<ArrayBuffer | undefined>;

  /**
   * Retrieves information about the current memory usage of the storage.
   */
  getUsage(): {
    totalCapacity: number;
    usedCapacity: number;
  };

  /**
   * Checks if a specific segment is present in the storage.
   * @param swarmId The swarm identifier.
   * @param streamId The stream identifier.
   * @param segmentId The segment identifier.
   * @returns `true` if the segment is in the storage, otherwise `false`.
   */
  hasSegment(swarmId: string, streamId: string, segmentId: number): boolean;

  /**
   * Retrieves the IDs of all segments for a specific stream currently stored in the storage.
   * @param swarmId The swarm identifier.
   * @param streamId The stream identifier.
   */
  getStoredSegmentIds(swarmId: string, streamId: string): number[];

  /**
   * Sets the callback function to be invoked when segments are added to or removed from the storage.
   * @param callback The callback function, which receives the `streamId` of the affected stream.
   */
  setSegmentChangeCallback(
    callback: ((streamId: string) => void) | undefined,
  ): void;

  /**
   * Destroys the storage and releases all associated resources.
   */
  destroy(): void;
}
