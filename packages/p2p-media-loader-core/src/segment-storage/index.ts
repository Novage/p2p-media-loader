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
   * Updates the storage with the core's estimate of the playhead.
   * @param position The playhead on the manifest timeline — the same
   * timeline as the `startTime`/`endTime` passed to `onSegmentRequested`, so
   * the two are directly comparable. It is derived from the last requested
   * segment and the player's reported buffer, never read from the player's
   * clock (see specs/playback-contract.md).
   * @param rate The current playback rate.
   */
  onPlaybackUpdated(position: number, rate: number): void;

  /**
   * Provides the storage with information about a segment requested by the player.
   * @param swarmId The swarm identifier.
   * @param streamSwarmId The stream's stream swarm ID (`Stream.streamSwarmId`), unique per stream identity.
   * @param segmentId The segment identifier (`Segment.externalId`).
   * @param startTime Start of the segment on the manifest timeline (`Segment.startTime`).
   * @param endTime End of the segment on the manifest timeline (`Segment.endTime`).
   * @param streamType The type of the stream.
   * @param isLiveStream Indicates whether the stream is live.
   */
  onSegmentRequested(
    swarmId: string,
    streamSwarmId: string,
    segmentId: number,
    startTime: number,
    endTime: number,
    streamType: StreamType,
    isLiveStream: boolean,
  ): void;

  /**
   * Stores the data for a specific segment.
   * @param swarmId The swarm identifier.
   * @param streamSwarmId The stream's stream swarm ID (`Stream.streamSwarmId`), unique per stream identity.
   * @param segmentId The segment identifier.
   * @param data The segment data to store.
   * @param startTime The start time of the segment.
   * @param endTime The end time of the segment.
   * @param streamType The type of the stream.
   * @param isLiveStream Indicates whether the stream is live.
   */
  storeSegment(
    swarmId: string,
    streamSwarmId: string,
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
   * @param streamSwarmId The stream's stream swarm ID (`Stream.streamSwarmId`), unique per stream identity.
   * @param segmentId The segment identifier.
   */
  getSegmentData(
    swarmId: string,
    streamSwarmId: string,
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
   * @param streamSwarmId The stream's stream swarm ID (`Stream.streamSwarmId`), unique per stream identity.
   * @param segmentId The segment identifier.
   * @returns `true` if the segment is in the storage, otherwise `false`.
   */
  hasSegment(
    swarmId: string,
    streamSwarmId: string,
    segmentId: number,
  ): boolean;

  /**
   * Retrieves the IDs of all segments for a specific stream currently stored in the storage.
   * @param swarmId The swarm identifier.
   * @param streamSwarmId The stream's stream swarm ID (`Stream.streamSwarmId`), unique per stream identity.
   */
  getStoredSegmentIds(swarmId: string, streamSwarmId: string): number[];

  /**
   * Sets the callback function to be invoked when segments are added to or removed from the storage.
   * @param callback The callback function, which receives the `streamSwarmId` of the affected stream.
   */
  setSegmentChangeCallback(
    callback: ((streamSwarmId: string) => void) | undefined,
  ): void;

  /**
   * Destroys the storage and releases all associated resources.
   */
  destroy(): void;
}
