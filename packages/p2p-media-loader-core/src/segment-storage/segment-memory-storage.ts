import { diagnostics } from "../diagnostics.js";
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
 * What the cache keeps per segment. The stream's type says which position the
 * segment is judged against: its own stream's.
 */
type SegmentDataItem = {
  segmentId: number;
  streamSwarmId: string;
  streamType: StreamType;
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
 * How far behind the position a live stream's segments are kept: three of
 * their own lengths, and never less than {@link LIVE_TRAILING_MIN_SECONDS}.
 *
 * Three segments is what peers need of each other. The position is where a
 * player's buffer ends, and peers at one placement request within a second or
 * two of each other on one stream, so a peer a little behind another still
 * finds the segment it wants held rather than having to fetch it again.
 */
const LIVE_TRAILING_SEGMENTS = 3;

/**
 * The floor under that window. On a stream of short segments three of them
 * are a few seconds, less than peers' positions can differ by — a peer that
 * started a little later, or stalled once — and a segment evicted early is
 * one the peer behind fetches over HTTP instead. The few megabytes this keeps
 * are nothing against a budget of gigabytes.
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
   * The latest position of each stream type: the start of the segment its
   * player requested last. A segment is judged against its own type's
   * position, which is where its own queue starts. One position for both
   * would be the other stream's half the time: at the start of a live DASH
   * stream dash.js fills video 12–20 s ahead of audio, and every video
   * request evicted audio segments that the audio queue still prefetched, so
   * it fetched them again, hundreds of times a minute. A type that stops
   * requesting keeps its position; its loader stops fetching with it, so
   * what that keeps is only what it already held.
   */
  private readonly positions = new Map<StreamType, Playback>();
  /**
   * Whether the stream the player last asked a segment of is live, which is
   * what tells the retention rule to keep a trailing window. Undefined until
   * the first request, when there is no position to measure anything against
   * either.
   */
  private lastRequestedIsLive?: boolean;
  private segmentChangeCallback?: (streamSwarmId: string) => void;

  /** Tells the probes of two storages on one page apart. */
  private static probeSequence = 0;
  private readonly unprobe: (() => void) | undefined;

  constructor() {
    this.logger = debug("p2pml-core:segment-memory-storage");
    this.logger.color = "RebeccaPurple";
    this.unprobe = diagnostics?.probe(
      `Storage#${++SegmentMemoryStorage.probeSequence}`,
      () => ({
        segments: this.cache.size,
        MiB: +this.currentStorageUsage.toFixed(1),
      }),
    );
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

  onPlaybackUpdated(position: number, rate: number, streamType: StreamType) {
    this.positions.set(streamType, { position, rate });
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
    streamType: StreamType,
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
      streamType,
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
    if (this.lastRequestedIsLive === undefined || !this.positions.size) {
      return {
        totalCapacity: this.segmentMemoryStorageLimit,
        usedCapacity: this.currentStorageUsage,
      };
    }
    const isLiveStream = this.lastRequestedIsLive;

    let calculatedUsedCapacity = 0;
    for (const segmentData of this.cache.values()) {
      if (!this.isRetained(segmentData, isLiveStream)) continue;

      calculatedUsedCapacity += segmentData.data.byteLength;
    }

    return {
      totalCapacity: this.segmentMemoryStorageLimit,
      usedCapacity: calculatedUsedCapacity / BYTES_PER_MiB,
    };
  }

  /**
   * Drops segments their manifest stopped listing, whatever the position: no
   * request can reach them again. Without this, a paused live player's
   * storage would keep every segment that ends after its frozen position —
   * each new one its peers fetch with it — until the storage brake stopped it.
   */
  onSegmentsRemoved(
    _swarmId: string,
    streamSwarmId: string,
    segmentIds: readonly number[],
  ) {
    let removed = false;
    for (const segmentId of segmentIds) {
      const storageId = getStorageItemId(streamSwarmId, segmentId);
      const item = this.cache.get(storageId);
      if (!item) continue;
      this.cache.delete(storageId);
      this.decreaseStorageUsage(item.data.byteLength);
      this.logger(
        `Removed segment ${segmentId} from stream ${streamSwarmId}: no longer in its manifest`,
      );
      diagnostics?.count("Evicted:left-window");
      removed = true;
    }
    if (removed) this.sendUpdatesToAffectedStreams(new Set([streamSwarmId]));
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
    if (!this.positions.size || !this.coreConfig) return;

    const isMemoryLimitReached = this.isMemoryLimitReached(newSegmentSize);

    if (!isMemoryLimitReached && !isLiveStream) return;

    const affectedStreams = new Set<string>();
    const sortedCache = Array.from(this.cache.values()).sort(
      (a, b) => a.startTime - b.startTime,
    );

    for (const segmentData of sortedCache) {
      const { streamSwarmId, segmentId, data } = segmentData;
      const storageId = getStorageItemId(streamSwarmId, segmentId);

      if (this.isRetained(segmentData, isLiveStream)) continue;

      this.cache.delete(storageId);
      affectedStreams.add(streamSwarmId);
      this.decreaseStorageUsage(data.byteLength);

      this.logger(`Removed segment ${segmentId} from stream ${streamSwarmId}`);
      diagnostics?.count("Evicted:trailing-or-limit");

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
   * Whether the cache has to keep this segment: everything from the position
   * on — the start of the segment a player requested last — and on live a
   * trailing window as well, so a peer a little behind this one — or a viewer
   * who pauses or steps back — still finds it there. That window is the
   * segment's own length a few times over, under a floor in seconds, and
   * follows no configured value: the urgency threshold is sized for requests
   * and can be as short as a single segment.
   *
   * Eviction frees what this refuses to keep and `getUsage` reports what it
   * keeps as occupied, so the brake on prefetching is measured against the
   * same rule that decides what can be freed. Reporting only the bytes from
   * the position on would leave a live stream's retained trailing window
   * invisible: unfreeable capacity that the brake would treat as free.
   */
  private isRetained(
    segmentData: SegmentDataItem,
    isLiveStream: boolean,
  ): boolean {
    const { startTime, endTime, streamType } = segmentData;
    // A type with no position yet has had no request: nothing of it is
    // behind anything.
    const position = this.positions.get(streamType)?.position;
    if (position === undefined || position <= endTime) return true;
    if (!isLiveStream) return false;

    const trailingWindow = Math.max(
      LIVE_TRAILING_SEGMENTS * (endTime - startTime),
      LIVE_TRAILING_MIN_SECONDS,
    );
    return position <= endTime + trailingWindow;
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
    this.unprobe?.();
    this.cache.clear();
    this.segmentChangeCallback = undefined;
  }
}
