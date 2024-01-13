import { Segment, Playback } from "../types";
import {
  getSegmentPlaybackStatuses,
  SegmentPlaybackStatuses,
  PlaybackTimeWindowsSettings,
} from "./stream";

export type QueueItem = { segment: Segment; statuses: SegmentPlaybackStatuses };

export function* generateQueue(
  lastRequestedSegment: Readonly<Segment>,
  playback: Readonly<Playback>,
  settings: PlaybackTimeWindowsSettings,
): Generator<QueueItem, void> {
  const { localId: requestedSegmentId, stream } = lastRequestedSegment;

  const requestedSegment = stream.segments.get(requestedSegmentId);
  if (!requestedSegment) return;

  const queueSegments = stream.segments.values();

  let first: Segment | undefined;

  while (first !== requestedSegment) {
    first = queueSegments.next().value;
  }

  if (!first) return; // should never happen

  const firstStatuses = getSegmentPlaybackStatuses(first, playback, settings);
  if (isNotActualStatuses(firstStatuses)) {
    // for cases when engine requests segment that is a little bit
    // earlier than current playhead position
    // it could happen when playhead position is significantly changed by user
    const second = queueSegments.next().value;
    if (!second) return;
    const secondStatuses = getSegmentPlaybackStatuses(
      second,
      playback,
      settings,
    );

    if (isNotActualStatuses(secondStatuses)) return;
    firstStatuses.isHighDemand = true;
    yield { segment: first, statuses: firstStatuses };
    yield { segment: second, statuses: secondStatuses };
  } else {
    yield { segment: first, statuses: firstStatuses };
  }

  for (const segment of queueSegments) {
    const statuses = getSegmentPlaybackStatuses(segment, playback, settings);
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
