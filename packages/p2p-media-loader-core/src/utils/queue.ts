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

  const queueSegments = stream.segments.values();

  let first: SegmentWithStream;

  do {
    const next = queueSegments.next();
    if (next.done) return; // should never happen
    first = next.value;
  } while (first !== requestedSegment);

  const firstStatuses = getSegmentPlaybackStatuses(
    first,
    playback,
    playbackConfig,
    currentP2PLoader,
    availablePercentMemory,
  );
  if (isNotActualStatuses(firstStatuses)) {
    const next = queueSegments.next();

    // for cases when engine requests segment that is a little bit
    // earlier than current playhead position
    // it could happen when playhead position is significantly changed by user
    if (next.done) return;

    const second = next.value;

    const secondStatuses = getSegmentPlaybackStatuses(
      second,
      playback,
      playbackConfig,
      currentP2PLoader,
      availablePercentMemory,
    );

    if (isNotActualStatuses(secondStatuses)) return;
    firstStatuses.isHighDemand = true;
    yield { segment: first, statuses: firstStatuses };
    yield { segment: second, statuses: secondStatuses };
  } else {
    yield { segment: first, statuses: firstStatuses };
  }

  for (const segment of queueSegments) {
    const statuses = getSegmentPlaybackStatuses(
      segment,
      playback,
      playbackConfig,
      currentP2PLoader,
      availablePercentMemory,
    );
    if (isNotActualStatuses(statuses)) break;
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

function isNotActualStatuses(statuses: SegmentPlaybackStatuses) {
  const { isHighDemand, isHttpDownloadable, isP2PDownloadable } = statuses;
  return !isHighDemand && !isHttpDownloadable && !isP2PDownloadable;
}
