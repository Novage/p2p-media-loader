import { CommonCoreConfig, StreamConfig, StreamType } from "../types.js";
import debug from "debug";
import { SegmentStorage } from "./index.js";
import {
  isAndroid,
  isIPadOrIPhone,
  isAndroidWebview,
  getStorageItemId,
} from "./utils.js";

/**
 * What the cache keeps per segment. The stream's type is not among it:
 * retention is measured in the segment's own length, so nothing here is
 * decided per stream type.
 */
type SegmentDataItem = {
  segmentId: number;
  streamSwarmId: string;
  data: ArrayBuffer;
  startTime: number;
  endTime: number;
};

type Playback = {
  position: number;
  rate: number;
};

const BYTES_PER_MiB = 1048576;
/**
 * How far behind the playhead a live stream's segments are kept: three of
 * their own lengths, and never less than {@link LIVE_TRAILING_MIN_SECONDS}.
 *
 * Three segments is what peers need of each other. They sit within a second
 * or two on one stream, and a peer a little behind another must still find
 * the segment it wants held rather than have to fetch it again.
 */
const LIVE_TRAILING_SEGMENTS = 3;

/**
 * The floor under that window, which is there for something else: the
 * position this store measures against is whichever loader reported last,
 * and on live HLS without programme dates the main and secondary playlists
 * are each anchored at zero on their own first parse, so the two timelines
 * can differ by seconds (see specs/playback-contract.md). A window measured
 * only in segments is narrower than that skew on a short-segment stream, and
 * would evict one stream's segments while its own playhead was still short of
 * them — segments the loader then fetches again over HTTP and stops seeding.
 * Seconds are the right unit for a fixed offset, and the few megabytes this
 * keeps are nothing against a budget of gigabytes.
 */
const LIVE_TRAILING_MIN_SECONDS = 15;

export class SegmentMemoryStorage implements SegmentStorage {
  private readonly userAgent = navigator.userAgent;
  private segmentMemoryStorageLimit = 4 * 1024;
  private currentStorageUsage = 0;

  private cache = new Map<string, SegmentDataItem>();
  private readonly logger: debug.Debugger;
  private coreConfig?: CommonCoreConfig;
  /**
   * The latest position reported, whichever loader reported it. Each loader
   * reports on its own stream's timeline, and on live HLS without programme
   * dates the two timelines can differ by seconds — within the trailing
   * window kept below. A position per stream or per type would be exact
   * while both report, and would freeze, retaining segments for ever, the
   * moment one stops.
   */
  private currentPlayback?: Playback;
  /**
   * Whether the stream the player last asked a segment of is live, which is
   * what tells the retention rule to keep a trailing window. Undefined until
   * the first request, when there is no playhead to measure anything against
   * either.
   */
  private lastRequestedIsLive?: boolean;
  private segmentChangeCallback?: (streamSwarmId: string) => void;

  constructor() {
    this.logger = debug("p2pml-core:segment-memory-storage");
    this.logger.color = "RebeccaPurple";
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async initialize(
    coreConfig: CommonCoreConfig,
    _mainStreamConfig: StreamConfig,
    _secondaryStreamConfig: StreamConfig,
  ) {
    this.coreConfig = coreConfig;

    this.setMemoryStorageLimit();
    this.logger("initialized");
  }

  onPlaybackUpdated(position: number, rate: number) {
    this.currentPlayback = { position, rate };
  }

  onSegmentRequested(
    _swarmId: string,
    _streamSwarmId: string,
    _segmentId: number,
    _startTime: number,
    _endTime: number,
    _streamType: StreamType,
    isLiveStream: boolean,
  ): void {
    this.lastRequestedIsLive = isLiveStream;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async storeSegment(
    _swarmId: string,
    streamSwarmId: string,
    segmentId: number,
    data: ArrayBuffer,
    startTime: number,
    endTime: number,
    _streamType: StreamType,
    isLiveStream: boolean,
  ) {
    this.clear(isLiveStream, data.byteLength);

    const storageId = getStorageItemId(streamSwarmId, segmentId);
    // Storing replaces, so what the entry held stops counting. The map is
    // idempotent under a repeated store and the byte count has to be too.
    const replaced = this.cache.get(storageId);
    if (replaced) this.decreaseStorageUsage(replaced.data.byteLength);

    this.cache.set(storageId, {
      data,
      segmentId,
      streamSwarmId,
      startTime,
      endTime,
    });
    this.increaseStorageUsage(data.byteLength);

    this.logger(`add segment: ${segmentId} to ${streamSwarmId}`);

    if (!this.segmentChangeCallback) {
      throw new Error("dispatchStorageUpdatedEvent is not set");
    }

    this.segmentChangeCallback(streamSwarmId);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSegmentData(
    _swarmId: string,
    streamSwarmId: string,
    segmentId: number,
  ) {
    const segmentStorageId = getStorageItemId(streamSwarmId, segmentId);
    const dataItem = this.cache.get(segmentStorageId);

    if (dataItem === undefined) return undefined;

    return dataItem.data;
  }

  getUsage() {
    const { currentPlayback } = this;
    if (this.lastRequestedIsLive === undefined || !currentPlayback) {
      return {
        totalCapacity: this.segmentMemoryStorageLimit,
        usedCapacity: this.currentStorageUsage,
      };
    }
    const isLiveStream = this.lastRequestedIsLive;
    const { position } = currentPlayback;

    let calculatedUsedCapacity = 0;
    for (const segmentData of this.cache.values()) {
      if (!this.isRetained(segmentData, isLiveStream, position)) continue;

      calculatedUsedCapacity += segmentData.data.byteLength;
    }

    return {
      totalCapacity: this.segmentMemoryStorageLimit,
      usedCapacity: calculatedUsedCapacity / BYTES_PER_MiB,
    };
  }

  hasSegment(_swarmId: string, streamSwarmId: string, externalId: number) {
    const segmentStorageId = getStorageItemId(streamSwarmId, externalId);
    const segment = this.cache.get(segmentStorageId);

    return segment !== undefined;
  }

  getStoredSegmentIds(_swarmId: string, streamSwarmId: string) {
    const externalIds: number[] = [];

    for (const {
      segmentId,
      streamSwarmId: streamCacheId,
    } of this.cache.values()) {
      if (streamCacheId !== streamSwarmId) continue;
      externalIds.push(segmentId);
    }

    return externalIds;
  }

  private clear(isLiveStream: boolean, newSegmentSize: number) {
    const { currentPlayback } = this;
    if (!currentPlayback || !this.coreConfig) return;

    const isMemoryLimitReached = this.isMemoryLimitReached(newSegmentSize);

    if (!isMemoryLimitReached && !isLiveStream) return;

    const affectedStreams = new Set<string>();
    const sortedCache = Array.from(this.cache.values()).sort(
      (a, b) => a.startTime - b.startTime,
    );

    for (const segmentData of sortedCache) {
      const { streamSwarmId, segmentId, data } = segmentData;
      const storageId = getStorageItemId(streamSwarmId, segmentId);

      if (
        this.isRetained(segmentData, isLiveStream, currentPlayback.position)
      ) {
        continue;
      }

      this.cache.delete(storageId);
      affectedStreams.add(streamSwarmId);
      this.decreaseStorageUsage(data.byteLength);

      this.logger(`Removed segment ${segmentId} from stream ${streamSwarmId}`);

      if (!this.isMemoryLimitReached(newSegmentSize) && !isLiveStream) break;
    }

    this.sendUpdatesToAffectedStreams(affectedStreams);
  }

  private isMemoryLimitReached(segmentByteLength: number) {
    return (
      this.currentStorageUsage + segmentByteLength / BYTES_PER_MiB >
      this.segmentMemoryStorageLimit
    );
  }

  setSegmentChangeCallback(
    callback: ((streamSwarmId: string) => void) | undefined,
  ) {
    this.segmentChangeCallback = callback;
  }

  private sendUpdatesToAffectedStreams(affectedStreams: Set<string>) {
    if (affectedStreams.size === 0) return;

    affectedStreams.forEach((stream) => {
      if (!this.segmentChangeCallback) {
        throw new Error("dispatchStorageUpdatedEvent is not set");
      }

      this.segmentChangeCallback(stream);
    });
  }

  /**
   * Whether the cache has to keep this segment: everything the playhead has
   * not passed, and on live a trailing window as well, so a peer a little
   * behind this one — or a viewer who pauses or steps back — still finds it
   * there. That window is the segment's own length a few times over, under a
   * floor in seconds, and follows no configured window: the high-demand
   * window is sized for scheduling ahead of the playhead and can be as short
   * as a single segment.
   *
   * Eviction frees what this refuses to keep and `getUsage` reports what it
   * keeps as occupied, so the brake on prefetching is measured against the
   * same rule that decides what can be freed. Reporting only the bytes ahead
   * of the playhead would leave a live stream's retained trailing window
   * invisible: unfreeable capacity that the brake would treat as free.
   */
  private isRetained(
    segmentData: SegmentDataItem,
    isLiveStream: boolean,
    currentPlaybackPosition: number,
  ): boolean {
    const { startTime, endTime } = segmentData;

    if (currentPlaybackPosition <= endTime) return true;
    if (!isLiveStream) return false;

    const trailingWindow = Math.max(
      LIVE_TRAILING_SEGMENTS * (endTime - startTime),
      LIVE_TRAILING_MIN_SECONDS,
    );
    return currentPlaybackPosition <= endTime + trailingWindow;
  }

  private increaseStorageUsage(segmentByteLength: number) {
    this.currentStorageUsage += segmentByteLength / BYTES_PER_MiB;
  }

  private decreaseStorageUsage(segmentByteLength: number) {
    this.currentStorageUsage -= segmentByteLength / BYTES_PER_MiB;
  }

  private setMemoryStorageLimit() {
    if (this.coreConfig?.segmentMemoryStorageLimit) {
      this.segmentMemoryStorageLimit =
        this.coreConfig.segmentMemoryStorageLimit;
      return;
    }

    if (isAndroidWebview(this.userAgent) || isIPadOrIPhone(this.userAgent)) {
      this.segmentMemoryStorageLimit = 1024;
    } else if (isAndroid(this.userAgent)) {
      this.segmentMemoryStorageLimit = 2 * 1024;
    }
  }

  public destroy() {
    this.cache.clear();
    this.segmentChangeCallback = undefined;
  }
}
