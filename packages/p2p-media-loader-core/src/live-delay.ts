import type { ProcessedManifest } from "./types.js";

/**
 * Where the player sits in a live window, and how much of the window it may
 * fetch. Both follow from the window's geometry — its length and the length of
 * a segment in it — and the core and every adapter size from the same rules
 * here, so the player's forward buffer and the core's high-demand window stay
 * in the order the design needs: the buffer reaching further than the window,
 * by enough for peers to hand a segment over. See specs/playback-contract.md,
 * "The time windows", and specs/player-adapters.md.
 *
 * The playhead goes as deep as the window allows, one segment inside the
 * tail, never more than a minute behind the edge. The player's own
 * out-of-window handling covers a playhead that drifts past the tail.
 *
 * A delay alone does not leave the window ahead of the buffer free for peers
 * to exchange: what the player fetches is a forward buffer ahead of the
 * playhead, and a player whose buffering goal is as wide as the window fetches
 * at the live edge however far behind it plays. An adapter that applies this
 * delay holds that buffer to `playerBufferFor` too.
 */
const MAX_LIVE_LATENCY = 60;
const LIVE_TAIL_MARGIN_SEGMENTS = 1;
/** Segments left between the player's forward buffer and the live edge. */
const LIVE_EDGE_MARGIN_SEGMENTS = 1;
/** Least forward buffer to leave the player, whatever the window works out to. */
const MIN_BUFFER_SEGMENTS = 2;

/**
 * The high-demand window when none is configured: what a VOD player gets, and
 * the most a live one gets — a live window narrower than twice this derives a
 * smaller one, so that half of what the player buffers is left to peers.
 */
export const DEFAULT_HIGH_DEMAND_TIME_WINDOW = 15;

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
 * How far ahead of the playhead a live player may fetch: up to a segment
 * short of the live edge, so the fetch position stays inside the window the
 * registry knows, and never less than two segments, so a player on a narrow
 * window can still keep going. The segments between this and the edge are
 * the ones peers fetch for each other.
 */
export function playerBufferFor(target: LiveDelay): number {
  return Math.max(
    MIN_BUFFER_SEGMENTS * target.segment,
    target.delay - LIVE_EDGE_MARGIN_SEGMENTS * target.segment,
  );
}

/**
 * The high-demand window the core schedules by: the nearer half of what the
 * player buffers, so the farther half is room for the prefetch election to
 * fill over P2P before the player asks; see specs/prefetch.md, "Room". Left
 * unconfigured it is also never more than the default, and never less than a
 * segment. Off live there is no geometry to derive from and the configured
 * number, or the default, is the window.
 *
 * **On live a configured number is a ceiling, not an override.** The player's
 * buffer is sized from the window's geometry by every adapter, and nothing an
 * integrator configures here widens it; a window configured past half that
 * buffer would cover everything the player fetches, so each peer would pull
 * the whole stream from the origin and the election would never see a
 * segment. That is the failure this rule exists to prevent, so the geometry
 * wins. A number still narrows the window, which leaves peers more room
 * rather than less. Whoever wants the player to fetch over HTTP regardless
 * has `isP2PDisabled`.
 *
 * @param configured - `StreamConfig.highDemandTimeWindow`.
 * @param target - The live window's placement, or `undefined` off live.
 */
export function highDemandWindowFor(
  configured: number | undefined,
  target: LiveDelay | undefined,
): number {
  if (!target) return configured ?? DEFAULT_HIGH_DEMAND_TIME_WINDOW;
  const room = playerBufferFor(target) / 2;
  if (configured !== undefined) return Math.min(configured, room);
  return Math.max(
    target.segment,
    Math.min(DEFAULT_HIGH_DEMAND_TIME_WINDOW, room),
  );
}

/** The placement a window of `count` segments spanning `window` seconds calls for. */
function liveDelayOf(window: number, count: number): LiveDelay | undefined {
  if (count === 0 || !(window > 0)) return;
  const segment = window / count;
  return { delay: liveDelayFromWindow(window, segment), segment };
}

/**
 * The placement a live stream's segments call for, or `undefined` for a stream
 * with none: the window is the span from the earliest start to the latest end,
 * and the segment its average length.
 */
export function liveDelayForSegments(
  segments: Iterable<{ readonly startTime: number; readonly endTime: number }>,
): LiveDelay | undefined {
  let start = Infinity;
  let end = -Infinity;
  let count = 0;
  for (const segment of segments) {
    start = Math.min(start, segment.startTime);
    end = Math.max(end, segment.endTime);
    count++;
  }
  return liveDelayOf(end - start, count);
}

/**
 * Which of a presentation's live streams places the player: the widest live
 * main stream, and the widest live stream of any type where there is no main.
 *
 * On an MPD every Representation shares one window, and on HLS one media
 * playlist arrives at a time. An audio-only presentation is the case the
 * fallback exists for: live radio is an MPD of audio Representations, which
 * the parsers type as secondary because that is what an audio track is beside
 * a video one, and without it that would be the one live presentation nobody
 * places.
 */
export function pickLiveTarget(
  streams: Iterable<{
    readonly type: "main" | "secondary";
    readonly target: LiveDelay | undefined;
  }>,
): LiveDelay | undefined {
  let main: LiveDelay | undefined;
  let widest: LiveDelay | undefined;
  for (const { type, target } of streams) {
    if (!target) continue;
    if (type === "main" && (!main || target.delay > main.delay)) main = target;
    if (!widest || target.delay > widest.delay) widest = target;
  }
  return main ?? widest;
}

/**
 * The presentation delay a processed manifest calls for, or `undefined` when
 * it described no live stream with segments. Decided among the streams the
 * manifest listed by the rule of `pickLiveTarget`.
 */
export function liveDelayFor(
  manifest: ProcessedManifest,
): LiveDelay | undefined {
  return pickLiveTarget(
    manifest.streams.map((stream) => ({
      type: stream.type,
      target: stream.isLive
        ? liveDelayOf(stream.end - stream.start, stream.segmentCount)
        : undefined,
    })),
  );
}
