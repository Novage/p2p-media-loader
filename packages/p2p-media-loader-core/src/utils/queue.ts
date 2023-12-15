import { Segment, Playback } from "../types";
import {
  getSegmentPlaybackStatuses,
  SegmentPlaybackStatuses,
  PlaybackTimeWindowsSettings,
} from "./stream";

export type QueueItem = { segment: Segment; statuses: SegmentPlaybackStatuses };

export function generateQueue({
  lastRequestedSegment,
  playback,
  settings,
  skipSegment,
}: {
  lastRequestedSegment: Readonly<Segment>;
  playback: Readonly<Playback>;
  skipSegment: (segment: Segment, statuses: SegmentPlaybackStatuses) => boolean;
  settings: PlaybackTimeWindowsSettings;
}): { queue: QueueItem[]; queueSegmentIds: Set<string> } {
  const { localId: requestedSegmentId, stream } = lastRequestedSegment;

  const queue: QueueItem[] = [];
  const queueSegmentIds = new Set<string>();

  const { segments } = stream;
  const isNextNotActual = (segmentId: string) => {
    const next = segments.getNextTo(segmentId)?.[1];
    if (!next) return true;
    const statuses = getSegmentPlaybackStatuses(next, playback, settings);
    return isNotActualStatuses(statuses);
  };

  let i = 0;
  for (const segment of segments.values(requestedSegmentId)) {
    const statuses = getSegmentPlaybackStatuses(segment, playback, settings);
    const isNotActual = isNotActualStatuses(statuses);
    if (isNotActual && (i !== 0 || isNextNotActual(requestedSegmentId))) break;
    i++;
    if (skipSegment(segment, statuses)) continue;

    if (isNotActual) statuses.isHighDemand = true;
    queue.push({ segment, statuses });
    queueSegmentIds.add(segment.localId);
  }

  return { queue, queueSegmentIds };
}

function isNotActualStatuses(statuses: SegmentPlaybackStatuses) {
  const { isHighDemand, isHttpDownloadable, isP2PDownloadable } = statuses;
  return !isHighDemand && !isHttpDownloadable && !isP2PDownloadable;
}
