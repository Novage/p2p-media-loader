import { BandwidthCalculator } from "./bandwidth-calculator.js";
import type { LiveDelay } from "./live-delay.js";
import { CoreRequestError, Segment, SegmentResponse, Stream } from "./types.js";

/** Where the core's current playback estimate came from. */
type PlaybackStateSource = "reported" | "inferred";

/**
 * The playhead as the request queue sees it. No absolute position: every
 * scheduling decision is a distance from the playhead, computed as
 * `segment.startTime - bufferEdge + bufferAhead`, so the manifest timeline and
 * the player's clock are never compared. See specs/playback-contract.md.
 */
export type Playback = {
  /** Manifest time at which the player's buffer currently ends. */
  bufferEdge: number;
  /** Seconds buffered ahead of the playhead, on the player's own clock. */
  bufferAhead: number;
  /** Rate used for window sizing; see HybridLoader.syncPlayback for pauses. */
  rate: number;
  source: PlaybackStateSource;
};

/** Extends a Segment with a reference to its associated stream. */
export type SegmentWithStream<TStream extends Stream = Stream> = Segment & {
  readonly stream: StreamWithSegments<TStream>;
};

/**
 * A registered stream together with the core's live segment registry.
 * Internal: the public API exposes only the base stream (`Core.getStream`).
 */
export type StreamWithSegments<TStream extends Stream = Stream> = TStream & {
  readonly segments: Map<string, SegmentWithStream<TStream>>;
};

export type BandwidthCalculators = Readonly<{
  all: BandwidthCalculator;
  http: BandwidthCalculator;
}>;

/** Derived from the manifests, never reported by an adapter. */
export type StreamDetails = {
  isLive: boolean;
  /**
   * Where a live player is placed, from the widest live main stream the
   * registry holds — the stream every adapter sizes the player's buffer by —
   * so both loaders derive their high-demand window from one geometry.
   * `undefined` off live, and on live until a stream has segments.
   */
  liveTarget: LiveDelay | undefined;
};

/** How a hybrid loader answers a segment request from `Core.loadSegment`. */
export type EngineCallbacks = {
  onSuccess: (response: SegmentResponse) => void;
  onError: (reason: CoreRequestError) => void;
};
