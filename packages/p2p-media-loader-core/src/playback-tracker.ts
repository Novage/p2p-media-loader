import type { Playback, SegmentWithStream } from "./internal-types.js";
import type { PlaybackState } from "./playback.js";

/**
 * Turns whatever the environment can tell us into the single `Playback` value
 * the request queue consumes. See specs/playback-contract.md.
 *
 * Two sources, one output:
 *   - "reported": an integration pushes `PlaybackState` (a media element, or a
 *     native shim behind a proxy);
 *   - "inferred": nobody reports, so it is derived from the request pattern the
 *     core already observes.
 *
 * Inference is a fallback inside the core, not a second contract. An
 * integration's only job is to report if it can and stay silent if it cannot.
 */

type SegmentLike = Pick<
  SegmentWithStream,
  "externalId" | "startTime" | "endTime"
>;

export type PlaybackTrackerConfig = {
  /**
   * A reported state older than this is stale; fall back to inference. A
   * paused report (rate 0) is exempt: nothing moves while paused, and the
   * one thing that can change — the buffer growing — fires a media event
   * that reports again.
   */
  reportStaleAfterMs: number;
  /** Starting guess for the player's buffer target, learned from there. */
  initialBufferTarget: number;
  /** Hard ceiling on the inferred estimate. */
  maxBufferTarget: number;
  /**
   * Inferred estimates are scaled down before use. Underestimating the buffer
   * costs P2P ratio; overestimating it stalls the viewer. Bias toward the
   * cheaper failure.
   */
  inferredSafetyFactor: number;
  /** Idle longer than `segmentDuration * this` means the buffer was full. */
  idleFullBufferRatio: number;
};

export const DEFAULT_PLAYBACK_TRACKER_CONFIG: PlaybackTrackerConfig = {
  reportStaleAfterMs: 2000,
  initialBufferTarget: 30,
  maxBufferTarget: 120,
  inferredSafetyFactor: 0.7,
  idleFullBufferRatio: 0.5,
};

export class PlaybackTracker {
  private readonly config: PlaybackTrackerConfig;
  private readonly now: () => number;

  private reported?: { state: PlaybackState; at: number };

  /**
   * Manifest time at which the player's buffer currently ends: the anchor's
   * `startTime` while the anchor is in flight, its `endTime` once delivered.
   * Kept explicit rather than derived, because the right value depends on
   * delivery state and the request path and the storage path read it at
   * different moments.
   */
  private bufferEdge: number;
  private anchor: SegmentLike;
  private lastDeliveryEndedAt = 0;

  // Inference anchor: the buffer held `atBuffer` seconds when the wall clock
  // read `atMs` and `atDelivered` seconds of media had been handed over.
  private atMs: number;
  private atBuffer = 0;
  private atDelivered = 0;
  private delivered = 0;
  private bufferTarget: number;

  constructor(
    initialSegment: SegmentLike,
    config: Partial<PlaybackTrackerConfig> = {},
    now: () => number = () => performance.now(),
  ) {
    this.config = { ...DEFAULT_PLAYBACK_TRACKER_CONFIG, ...config };
    this.now = now;
    this.bufferTarget = this.config.initialBufferTarget;
    this.anchor = initialSegment;
    this.bufferEdge = initialSegment.startTime;
    this.atMs = this.now();
  }

  /** Integration push: media events in a browser, or a native bridge. */
  report(state: PlaybackState): void {
    this.reported = {
      state: { bufferAhead: Math.max(0, state.bufferAhead), rate: state.rate },
      at: this.now(),
    };
  }

  /**
   * The player asked for a segment. In flight, its buffer ends where that
   * segment begins; that is precisely why it is being requested.
   *
   * Also the seek detector: a request that is not the successor of the previous
   * one means the player jumped, and a jump means its buffer was discarded.
   * Returns whether a seek was detected so the caller can react.
   */
  onSegmentRequested(segment: SegmentLike): boolean {
    const now = this.now();
    const previous = this.anchor;
    this.anchor = segment;
    this.bufferEdge = segment.startTime;

    // Continuity is judged on the timeline, not on `externalId`: HLS ids step
    // by one, DASH ids by the segment's length in 100 ms units. A retry of the
    // same segment is not a jump either.
    const isSuccessor =
      segment.externalId === previous.externalId ||
      continues(previous, segment);

    if (!isSuccessor) {
      this.reanchor(now, 0);
      return true;
    }

    // A sequential request arriving after an idle gap: the player was not
    // fetching because it had nowhere to put the data. Its buffer was at target.
    const idle = (now - this.lastDeliveryEndedAt) / 1000;
    const duration = segment.endTime - segment.startTime;
    if (
      this.lastDeliveryEndedAt > 0 &&
      duration > 0 &&
      idle > duration * this.config.idleFullBufferRatio
    ) {
      this.learnBufferTarget(this.rawInferredBufferAhead(now));
      this.reanchor(now, this.bufferTarget);
    }
    return false;
  }

  /** A segment's bytes reached the player: the buffer now extends through it. */
  onSegmentDelivered(segment: SegmentLike): void {
    this.delivered += Math.max(0, segment.endTime - segment.startTime);
    this.lastDeliveryEndedAt = this.now();
    // Never let an out-of-order completion drag the edge backwards.
    this.bufferEdge = Math.max(this.bufferEdge, segment.endTime);
  }

  /** The value the queue reads. */
  getPlayback(): Playback {
    const now = this.now();
    const { reported } = this;

    const fresh =
      reported &&
      (reported.state.rate === 0 ||
        now - reported.at <= this.config.reportStaleAfterMs);
    if (reported && fresh) {
      return {
        bufferEdge: this.bufferEdge,
        bufferAhead: reported.state.bufferAhead,
        rate: reported.state.rate,
        source: "reported",
      };
    }

    return {
      bufferEdge: this.bufferEdge,
      bufferAhead:
        this.rawInferredBufferAhead(now) * this.config.inferredSafetyFactor,
      // Rate is the one genuinely ambiguous input when inferring. Assuming 1
      // is safe: it decays the estimate, which only ever makes the core more
      // eager to use HTTP, and the core acts only when a request arrives, so
      // a paused player costs nothing.
      rate: 1,
      source: "inferred",
    };
  }

  private rawInferredBufferAhead(now: number): number {
    const elapsed = (now - this.atMs) / 1000;
    const produced = this.delivered - this.atDelivered;
    return clamp(this.atBuffer + produced - elapsed, 0, this.bufferTarget);
  }

  private reanchor(now: number, bufferAhead: number): void {
    this.atMs = now;
    this.atBuffer = bufferAhead;
    this.atDelivered = this.delivered;
  }

  private learnBufferTarget(observed: number): void {
    if (observed <= 0) return;
    // EWMA toward what the player actually holds before it idles.
    const next = this.bufferTarget * 0.8 + observed * 0.2;
    this.bufferTarget = clamp(next, 1, this.config.maxBufferTarget);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Whether `next` starts where `previous` ends, within half the shorter of the
 * two durations — enough to absorb timeline rounding, not enough to hide a
 * skipped segment.
 */
function continues(previous: SegmentLike, next: SegmentLike): boolean {
  const tolerance =
    Math.min(
      previous.endTime - previous.startTime,
      next.endTime - next.startTime,
    ) / 2;
  return Math.abs(next.startTime - previous.endTime) <= tolerance;
}
