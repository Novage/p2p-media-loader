import {
  Playback,
  SegmentWithStream,
  StreamWithSegments,
} from "../internal-types.js";
import { P2PLoader } from "../p2p/loader.js";
import {
  getSegmentPlaybackStatuses,
  SegmentPlaybackStatuses,
  PlaybackTimeWindowsConfig,
} from "./stream.js";

export type QueueItem = {
  segment: SegmentWithStream;
  statuses: SegmentPlaybackStatuses;
};

/**
 * The segments a queue pass prefetches: from the segment the player requested
 * last, forward, while a segment is in the HTTP or the P2P window.
 */
export function* generateQueue(
  lastRequestedSegment: Readonly<SegmentWithStream>,
  playback: Readonly<Playback>,
  playbackConfig: PlaybackTimeWindowsConfig,
  currentP2PLoader: P2PLoader,
  availablePercentMemory: number,
): Generator<QueueItem, void> {
  const { runtimeId, stream } = lastRequestedSegment;

  const requestedSegment =
    stream.segments.get(runtimeId) ?? reanchor(stream, lastRequestedSegment);
  if (!requestedSegment) return;

  let started = false;
  for (const segment of stream.segments.values()) {
    if (!started) {
      if (segment !== requestedSegment) continue;
      started = true;
    }
    const statuses = getSegmentPlaybackStatuses(
      segment,
      playback,
      playbackConfig,
      currentP2PLoader,
      availablePercentMemory,
    );
    if (!statuses.isHttpDownloadable && !statuses.isP2PDownloadable) break;
    yield { segment, statuses };
  }
}

/**
 * Where to resume when a live window has rolled past the segment the player
 * last asked for: the oldest segment the window still holds that is not behind
 * it.
 *
 * The anchor ages out whenever the player loads without core for a while — a
 * request the registry could not resolve went to the player's own loader (see
 * specs/manifest-registry.md, "Divergence between core and the player"), or the
 * player simply stopped fetching with a full buffer. Losing the anchor must not
 * stop the queue: a peer that holds the window is still worth something to the
 * swarm, and prefetching keeps the segments the player will want next within
 * reach. Where the player actually is stays unknown until it requests again, so
 * this resumes from the earliest position it can possibly have, never from the
 * live edge.
 */
function reanchor(
  stream: StreamWithSegments,
  lastRequestedSegment: Readonly<SegmentWithStream>,
): SegmentWithStream | undefined {
  for (const segment of stream.segments.values()) {
    if (segment.startTime >= lastRequestedSegment.startTime) return segment;
  }
}
