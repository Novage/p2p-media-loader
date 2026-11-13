import { BandwidthCalculator } from "./bandwidth-calculator.js";
import type { LiveDelay } from "./live-delay.js";
import { CoreRequestError, Segment, SegmentResponse, Stream } from "./types.js";

/**
 * Where the request queue measures its windows from. No playhead: the
 * position is the start of the segment the player requested last, on the
 * manifest timeline, so the manifest timeline and the player's clock are
 * never compared. See specs/playback-contract.md, "The position".
 */
export type Playback = {
  /** Manifest time at which the segment the player requested last starts. */
  position: number;
  /** The last non-zero rate the player reported, or 1; sizes the windows. */
  rate: number;
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
   * so both loaders derive their urgency threshold from one geometry.
   * `undefined` off live, and on live until a stream has segments.
   */
  liveTarget: LiveDelay | undefined;
};

/** How a hybrid loader answers a segment request from `Core.loadSegment`. */
export type EngineCallbacks = {
  onSuccess: (response: SegmentResponse) => void;
  onError: (reason: CoreRequestError) => void;
};
