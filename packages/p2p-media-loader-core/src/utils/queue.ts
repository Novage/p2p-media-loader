import { Playback } from "../internal-types.js";
import { P2PLoader } from "../p2p/loader.js";
import { SegmentWithStream } from "../types.js";
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
): Generator<QueueItem, void> {
  const { runtimeId, stream } = lastRequestedSegment;

  const requestedSegment = stream.segments.get(runtimeId);
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
    );
    if (isNotActualStatuses(statuses)) break;
    yield { segment, statuses };
  }
}

function isNotActualStatuses(statuses: SegmentPlaybackStatuses) {
  const {
    isHighDemand = false,
    isHttpDownloadable = false,
    isP2PDownloadable = false,
  } = statuses;
  return !isHighDemand && !isHttpDownloadable && !isP2PDownloadable;
}
