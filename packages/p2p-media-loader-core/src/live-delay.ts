import type { ProcessedManifest } from "./types.js";

/**
 * Where the player sits in a live window. Mirrors the HLS.js adapter: as deep
 * as the window allows, one segment inside the tail, never more than a
 * minute behind the edge. Its own out-of-window handling covers a playhead
 * that drifts past the tail.
 *
 * A delay alone does not leave the window ahead of the buffer free for peers
 * to exchange: what the player fetches is a forward buffer ahead of the
 * playhead, and a player whose buffering goal is as wide as the window fetches
 * at the live edge however far behind it plays. An adapter that applies this
 * delay holds that buffer down too. Shared by the Shaka and dash.js adapters;
 * see specs/player-adapters.md.
 */
const MAX_LIVE_LATENCY = 60;
const LIVE_TAIL_MARGIN_SEGMENTS = 1;

export type LiveDelay = {
  /** Seconds behind the live edge to place the playhead. */
  readonly delay: number;
  /** Average segment length of the stream the delay was derived from. */
  readonly segment: number;
};

/**
 * Where a live source starts, before any manifest has said how wide its
 * window is: deep enough that a peer has something to fetch ahead of the
 * playhead, and shallow enough to sit inside any window worth sharing. The
 * adapters that place a player before its first manifest hold it here.
 */
export const INITIAL_LIVE_DELAY = 25;

/**
 * How far behind the live edge to place a player, given the window it has and
 * the length of a segment in it: as deep as the window allows, one segment
 * inside the tail, never more than a minute behind, and never less than a
 * segment. Adapters that read the window from their player rather than from a
 * processed manifest — HLS.js reports it on every level update — size the
 * placement with this directly.
 */
export function liveDelayFromWindow(window: number, segment: number): number {
  return Math.max(
    segment,
    Math.min(window - LIVE_TAIL_MARGIN_SEGMENTS * segment, MAX_LIVE_LATENCY),
  );
}

/**
 * The presentation delay a processed manifest calls for, or `undefined` when
 * it described no live stream with segments. Among the streams the manifest
 * listed, the widest live main stream decides; on an MPD every
 * Representation shares one window, and on HLS one media playlist arrives at
 * a time.
 *
 * A presentation with no main stream at all is placed by the widest live
 * stream it does have. An audio-only one is the case that matters: live radio
 * is an MPD of audio Representations, which the parsers type as secondary
 * because that is what an audio track is beside a video one, and without this
 * it would be the one live presentation nobody places.
 */
export function liveDelayFor(
  manifest: ProcessedManifest,
): LiveDelay | undefined {
  let main: LiveDelay | undefined;
  let widest: LiveDelay | undefined;
  for (const stream of manifest.streams) {
    if (!stream.isLive || stream.segmentCount === 0) continue;
    const window = stream.end - stream.start;
    if (!(window > 0)) continue;
    const segment = window / stream.segmentCount;
    const delay = liveDelayFromWindow(window, segment);
    if (stream.type === "main" && (!main || delay > main.delay)) {
      main = { delay, segment };
    }
    if (!widest || delay > widest.delay) widest = { delay, segment };
  }
  return main ?? widest;
}
