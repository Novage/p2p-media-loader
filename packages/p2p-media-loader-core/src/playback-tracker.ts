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

/**
 * What a player request was, for the buffer edge. See
 * specs/playback-contract.md, "The buffer edge".
 *
 * - `extend`: the request continues the stream; the edge moves to its start
 *   where that is further.
 * - `rerequest`: the player is fetching again media it holds, with no seek
 *   between — dash.js replaces segments at a higher quality this way; the edge
 *   stays.
 * - `seek`: the player jumped; the edge re-anchors at the request.
 */
export type RequestKind = "extend" | "rerequest" | "seek";

const DEFAULT_PLAYBACK_TRACKER_CONFIG: PlaybackTrackerConfig = {
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
   * The seek count the integration last reported, and the one it had reported
   * when this stream last requested. They differ while a seek this stream has
   * not requested after is under way. Both undefined while the integration
   * reports no count.
   */
  private seekCount?: number;
  private seekCountAtRequest?: number;
  /** Whether the player reported media at the position of the last seek. */
  private seekLandedInBuffer = false;

  /**
   * Manifest time at which the player's buffer currently ends: the anchor's
   * `startTime` while the anchor is in flight, its `endTime` once delivered.
   * Kept explicit rather than derived, because the right value depends on
   * delivery state and the request path and the storage path read it at
   * different moments.
   */
  private bufferEdge: number;
  private anchor: SegmentLike;
  /**
   * Whether the request that set the edge was delivered. Only then does the
   * player hold media up to the edge, and a request before it is fetching
   * again what it holds; after a request it abandoned, it is a move.
   */
  private anchorDelivered = false;
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
    const now = this.now();
    const bufferAhead = Math.max(0, state.bufferAhead);
    this.reported = { state: { bufferAhead, rate: state.rate }, at: now };
    if (state.seekCount !== undefined) {
      // The report of the seek itself says where it landed. A later one does
      // not: once another stream's media arrives there, the player reports a
      // buffer although this stream has none at the new position.
      if (state.seekCount !== this.seekCount) {
        this.seekLandedInBuffer = bufferAhead > 0;
      }
      this.seekCount = state.seekCount;
      // The first count this stream sees is where it starts from, not a seek.
      this.seekCountAtRequest ??= state.seekCount;
    }
    // A report is the one measurement of the buffer there is, so inference
    // anchors on it as well. An integration that samples its player rarely —
    // a proxy once per segment — spends most of its time inferring, and
    // without this each of those stretches would resume from whatever seek or
    // idle gap last anchored it, carrying every error accumulated since.
    this.reanchor(now, bufferAhead);
  }

  /** Whether the integration reports a seek count. */
  reportsSeekCount(): boolean {
    return this.seekCount !== undefined;
  }

  /**
   * A seek has been reported that this stream has not requested since. Its
   * next request re-anchors the edge, wherever it is.
   */
  private hasSeekSinceRequest(): boolean {
    return (
      this.seekCount !== undefined && this.seekCount !== this.seekCountAtRequest
    );
  }

  /**
   * A seek has been reported that this stream has not requested since, and
   * the player held no media at the new position: the edge describes the
   * position it left. A seek into buffered media reports a buffer at once,
   * and may bring no request for as long as that buffer lasts; its edge is
   * the one the player holds, or, after a seek into an earlier island, wrong
   * until the request the player then makes at once. See
   * specs/playback-contract.md, "Behaviour under seeking".
   */
  isSeekPending(): boolean {
    return this.hasSeekSinceRequest() && !this.seekLandedInBuffer;
  }

  /**
   * The player asked for a segment. In flight, its buffer ends where that
   * segment begins; that is precisely why it is being requested.
   *
   * Also the seek detector. With a seek count, a seek is a request after the
   * count moved, and a request before the edge with no seek between is the
   * player fetching again what it holds. Without one, the two cannot be told
   * apart, and a request that does not continue the stream is taken for a
   * seek. See specs/playback-contract.md, "The buffer edge".
   */
  onSegmentRequested(segment: SegmentLike): RequestKind {
    const now = this.now();
    const previous = this.anchor;
    const seekSinceRequest = this.hasSeekSinceRequest();
    const countReported = this.seekCount !== undefined;
    const { anchorDelivered } = this;
    this.anchor = segment;
    this.anchorDelivered = false;
    this.seekCountAtRequest = this.seekCount;

    // Continuity is judged on the timeline, not on `externalId`: HLS ids step
    // by one, DASH ids by the segment's length in 100 ms units. A retry of the
    // same segment is not a jump either. A request that resumes at the edge
    // after re-requests continues the stream too.
    const isSuccessor =
      segment.externalId === previous.externalId ||
      continues(previous, segment) ||
      continuesAt(this.bufferEdge, segment);

    let kind: RequestKind;
    if (seekSinceRequest) kind = "seek";
    else if (isSuccessor) kind = "extend";
    else if (!countReported) kind = "seek";
    else if (segment.startTime >= this.bufferEdge) kind = "extend";
    else kind = anchorDelivered ? "rerequest" : "seek";

    if (kind === "seek") {
      this.bufferEdge = segment.startTime;
      this.reanchor(now, 0);
      return kind;
    }
    if (kind === "rerequest") return kind;

    this.bufferEdge = Math.max(this.bufferEdge, segment.startTime);
    if (!isSuccessor) return kind;

    // A sequential request arriving after an idle gap: the player was not
    // fetching because it had nowhere to put the data. Its buffer was at target.
    const idle = (now - this.lastDeliveryEndedAt) / 1000;
    const duration = segment.endTime - segment.startTime;
    if (
      this.lastDeliveryEndedAt > 0 &&
      duration > 0 &&
      idle > duration * this.config.idleFullBufferRatio
    ) {
      // From the unclamped estimate: clamped to the current target, the
      // observation could never exceed it and the target could only fall.
      this.learnBufferTarget(this.unclampedInferredBufferAhead(now));
      this.reanchor(now, this.bufferTarget);
    }
    return kind;
  }

  /** A segment's bytes reached the player: the buffer now extends through it. */
  onSegmentDelivered(segment: SegmentLike): void {
    if (segment.externalId === this.anchor.externalId) {
      this.anchorDelivered = true;
    }
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
    return clamp(this.unclampedInferredBufferAhead(now), 0, this.bufferTarget);
  }

  private unclampedInferredBufferAhead(now: number): number {
    const elapsed = (now - this.atMs) / 1000;
    const produced = this.delivered - this.atDelivered;
    return this.atBuffer + produced - elapsed;
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
/** Whether `next` starts at `edge`, within half its own duration. */
function continuesAt(edge: number, next: SegmentLike): boolean {
  return Math.abs(next.startTime - edge) <= (next.endTime - next.startTime) / 2;
}

function continues(previous: SegmentLike, next: SegmentLike): boolean {
  const tolerance =
    Math.min(
      previous.endTime - previous.startTime,
      next.endTime - next.startTime,
    ) / 2;
  return Math.abs(next.startTime - previous.endTime) <= tolerance;
}
