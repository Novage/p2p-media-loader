import { CommonCoreConfig, StreamConfig, StreamType } from "../types.js";
/** The interface for segment storage. */
export interface SegmentStorage {
  /**
   * Initializes the storage.
   *
   * The stream configurations are the configured values, not the effective
   * ones: `highDemandTimeWindow` is `undefined` unless an integrator set a
   * number, since the core derives it per stream from the live window (see
   * specs/playback-contract.md, "The time windows"). A storage that sizes
   * anything from it must handle `undefined` — arithmetic on it yields `NaN`,
   * and every comparison against `NaN` is false. Retention behind the
   * playhead is not the high-demand window's business in any case; the
   * bundled storage measures it in the segment's own length.
   *
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
   * segment and the player's reported buffer — or, where the player reports
   * nothing, from the core's own estimate of what it holds — never read from
   * the player's clock (see specs/playback-contract.md). Told at the start
   * and whenever the estimate moves, whether or not `updatePlayback` was
   * called.
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
   * Stores the data for a specific segment. Storing a segment that is already
   * stored replaces it, and what it held stops counting towards the storage's
   * usage.
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
   * Tells the storage that segments of a stream are no longer listed by the
   * stream's manifest: a live window has moved past them. Nothing can request
   * such a segment again — the core matches every request through the
   * segments the manifests list, and a peer asks only for what its own
   * manifest lists — so a storage may drop it at once, wherever the playhead
   * is. That is what keeps the storage of a paused live player bounded by the
   * window while the player goes on fetching its share for its peers.
   *
   * Optional. A storage without it keeps such segments until its own rules
   * let them go.
   *
   * @param swarmId The swarm identifier.
   * @param streamSwarmId The stream's stream swarm ID (`Stream.streamSwarmId`), unique per stream identity.
   * @param segmentIds The segments that left, by `Segment.externalId`.
   */
  onSegmentsRemoved?(
    swarmId: string,
    streamSwarmId: string,
    segmentIds: readonly number[],
  ): void;

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
    /**
     * How much the storage can hold. Any unit works if `usedCapacity` uses
     * the same one: the core reads only the ratio of the two. The built-in
     * memory storage reports MiB.
     */
    totalCapacity: number;
    /**
     * How much of `totalCapacity` the kept segments take, in the same unit.
     * As the storage fills, the core loads less far ahead of the playhead.
     */
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
