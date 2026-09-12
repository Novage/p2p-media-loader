/**
 * The playback contract: everything the core needs to know about where the
 * player is and how urgently it needs what it just asked for.
 *
 * Deliberately not player-shaped. It is the intersection of what a media
 * element, ExoPlayer and AVPlayer can all answer, so adding a player never
 * means widening it. See specs/playback-contract.md.
 */

/** A buffered interval, in seconds on the player's own timeline. */
export type TimeRange = {
  readonly start: number;
  readonly end: number;
};

/**
 * Playback state as reported by a player integration.
 *
 * There is no playhead position here, and that is the point. Where the player
 * is in the stream is already known from the last requested segment, in
 * manifest time; `bufferAhead` is a duration, so it is invariant under the
 * offset between the player's timeline and the manifest's. Never reporting an
 * absolute position is what lets a manifest-derived registry and any player
 * share one timebase with no calibration step.
 */
export type PlaybackState = {
  /**
   * Seconds of contiguous media buffered ahead of the playhead. Zero when the
   * playhead sits in a gap: an unbuffered playhead is maximum urgency.
   */
  readonly bufferAhead: number;

  /** Effective playback rate; 0 while paused. */
  readonly rate: number;
};

/** Where the core's current playback estimate came from. */
export type PlaybackStateSource = "reported" | "inferred";

/**
 * Seconds buffered ahead of `currentTime`, taken from the range that contains
 * it.
 *
 * The containing range is the one that matters, not the last one: after a seek
 * across a gap the buffer is a set of disjoint islands, and the final island
 * may describe media the playhead is nowhere near.
 */
export function getBufferAhead(
  ranges: readonly TimeRange[],
  currentTime: number,
): number {
  for (const { start, end } of ranges) {
    if (start <= currentTime && currentTime <= end) {
      return Math.max(0, end - currentTime);
    }
  }
  return 0;
}

/** Reads the contract straight off a media element. */
export function getPlaybackStateFromMediaElement(
  media: Pick<
    HTMLMediaElement,
    "currentTime" | "playbackRate" | "paused" | "buffered"
  >,
): PlaybackState {
  const { buffered, currentTime } = media;
  const ranges: TimeRange[] = [];
  for (let i = 0; i < buffered.length; i++) {
    ranges.push({ start: buffered.start(i), end: buffered.end(i) });
  }

  return {
    bufferAhead: getBufferAhead(ranges, currentTime),
    rate: media.paused ? 0 : media.playbackRate,
  };
}
