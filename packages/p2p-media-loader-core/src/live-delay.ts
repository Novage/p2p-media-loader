import type { ProcessedManifest } from "./types.js";

/**
 * Where the player sits in a live window, and how much of the window it may
 * fetch. Both follow from the window's geometry — its length and the length of
 * a segment in it — and the core and every adapter size from the same rules
 * here, so the player's forward buffer and the core's urgency threshold stay
 * in the order the design needs: the buffer reaching further than the
 * threshold, by enough for peers to hand a segment over. See
 * specs/playback-contract.md, "The urgency threshold", and
 * specs/player-adapters.md.
 *
 * The playhead goes as deep as the window allows, one segment inside the
 * tail, never more than a minute behind the edge. A playhead that a pause or
 * a stall carries past `maxLiveLatencyFor` is brought back to the delay.
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
/** How far past the live delay a player may fall before it is re-synced. */
const LIVE_RESYNC_MARGIN_SEGMENTS = 2;

/**
 * The urgency threshold when none is configured: what a VOD player gets, and
 * the most a live one gets — a live window narrower than twice this derives a
 * lower one, so that half of what the player buffers is left to peers.
 *
 * @category Integration
 */
export const DEFAULT_URGENT_BUFFER_THRESHOLD = 15;

/**
 * Where a live player is placed, and the segment length the placement was
 * derived from: what every adapter sizes the player's buffer by.
 *
 * @category Integration
 */
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
 *
 * @category Integration
 */
export const INITIAL_LIVE_DELAY = 25;

/**
 * How far behind the live edge to place a player, given the window it has and
 * the length of a segment in it: as deep as the window allows, one segment
 * inside the tail, never more than a minute behind, and never less than a
 * segment. Adapters that read the window from their player rather than from a
 * processed manifest — HLS.js reports it on every level update — size the
 * placement with this directly.
 *
 * @category Integration
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
 *
 * @category Integration
 */
export function playerBufferFor(target: LiveDelay): number {
  return Math.max(
    MIN_BUFFER_SEGMENTS * target.segment,
    target.delay - LIVE_EDGE_MARGIN_SEGMENTS * target.segment,
  );
}

/**
 * How far behind the live edge a placed player may fall before it is brought
 * back to its live delay: two segments past the delay. A pause or a stall
 * leaves the playhead where it was while the window moves on, and the forward
 * buffer ahead of it then reaches back toward the tail. At this distance the
 * buffer still ends inside the window — the delay is a segment inside the
 * tail and the buffer at least two segments long — so the player is re-synced
 * while its next request is still for a segment the registry lists.
 *
 * An adapter raises the threshold to the window where the window is wider —
 * a DVR window — so that a viewer who rewound into it is not pulled back.
 *
 * @category Integration
 */
export function maxLiveLatencyFor(target: LiveDelay): number {
  return target.delay + LIVE_RESYNC_MARGIN_SEGMENTS * target.segment;
}

/**
 * The buffer below which a player request is urgent: half of what the player
 * buffers, so the other half is the time peers have to fill the player's
 * requests before they become urgent; see specs/prefetch.md, "Room". Left
 * unconfigured it is also never more than the default, and never less than a
 * segment. Off live there is no geometry to derive from and the configured
 * number, or the default, is the threshold.
 *
 * **On live a configured number is a ceiling, not an override.** The player's
 * buffer is sized from the window's geometry by every adapter, and nothing an
 * integrator configures here widens it; a threshold configured past half that
 * buffer would make every request urgent when it is made, so each peer would
 * pull the whole stream from the origin and the election would never see a
 * segment. That is the failure this rule exists to prevent, so the geometry
 * wins. A number still lowers the threshold, which leaves peers more room
 * rather than less. Whoever wants the player to fetch over HTTP regardless
 * has `isP2PDisabled`.
 *
 * @param configured - `StreamConfig.urgentBufferThreshold`.
 * @param target - The live window's placement, or `undefined` off live.
 *
 * @category Integration
 */
export function urgentBufferThresholdFor(
  configured: number | undefined,
  target: LiveDelay | undefined,
): number {
  if (!target) return configured ?? DEFAULT_URGENT_BUFFER_THRESHOLD;
  const room = playerBufferFor(target) / 2;
  if (configured !== undefined) return Math.min(configured, room);
  return Math.max(
    target.segment,
    Math.min(DEFAULT_URGENT_BUFFER_THRESHOLD, room),
  );
}

/**
 * The placement `count` segments spanning `span` seconds call for: the segment
 * is their average length, and the window the span — or the window the
 * manifest declares, where the span is not a stable measure of it.
 */
function liveDelayOf(
  span: number,
  count: number,
  declaredWindow?: number,
): LiveDelay | undefined {
  if (count === 0 || !(span > 0)) return;
  const segment = span / count;
  const window = declaredWindow ?? span;
  return { delay: liveDelayFromWindow(window, segment), segment };
}

/**
 * The placement a live stream's segments call for, or `undefined` for a stream
 * with none: the window is the span from the earliest start to the latest end,
 * and the segment its average length.
 *
 * @param declaredWindow - The window the stream's manifest declares, where the
 * span is not a stable measure of it; it is the window then. See
 * `ProcessedStream.declaredWindow`.
 *
 * @category Integration
 */
export function liveDelayForSegments(
  segments: Iterable<{ readonly startTime: number; readonly endTime: number }>,
  declaredWindow?: number,
): LiveDelay | undefined {
  let start = Infinity;
  let end = -Infinity;
  let count = 0;
  for (const segment of segments) {
    start = Math.min(start, segment.startTime);
    end = Math.max(end, segment.endTime);
    count++;
  }
  return liveDelayOf(end - start, count, declaredWindow);
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
 *
 * @category Integration
 */
export function liveDelayFor(
  manifest: ProcessedManifest,
): LiveDelay | undefined {
  return pickLiveTarget(
    manifest.streams.map((stream) => ({
      type: stream.type,
      target: stream.isLive
        ? liveDelayOf(
            stream.end - stream.start,
            stream.segmentCount,
            stream.declaredWindow,
          )
        : undefined,
    })),
  );
}
