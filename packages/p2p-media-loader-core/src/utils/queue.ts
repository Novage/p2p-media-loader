import { Segment, Settings } from "../types";
import {
  LoadBufferRanges,
  NumberRange,
  Playback,
  QueueItem,
  QueueItemStatuses,
} from "../internal-types";

export function generateQueue({
  lastRequestedSegment,
  playback,
  settings,
  skipSegment,
}: {
  lastRequestedSegment: Readonly<Segment>;
  playback: Readonly<Playback>;
  skipSegment: (segment: Segment, statuses: QueueItemStatuses) => boolean;
  settings: Pick<
    Settings,
    "highDemandTimeWindow" | "httpDownloadTimeWindow" | "p2pDownloadTimeWindow"
  >;
}): { queue: QueueItem[]; queueSegmentIds: Set<string> } {
  const bufferRanges = getLoadBufferRanges(playback, settings);
  const { localId: requestedSegmentId, stream } = lastRequestedSegment;

  const queue: QueueItem[] = [];
  const queueSegmentIds = new Set<string>();

  const { segments } = stream;
  const isNextNotActual = (segmentId: string) => {
    const next = segments.getNextTo(segmentId)?.[1];
    if (!next) return true;
    const statuses = getSegmentLoadStatuses(next, bufferRanges);
    return isNotActualStatuses(statuses);
  };

  let i = 0;
  for (const segment of segments.values(requestedSegmentId)) {
    const statuses = getSegmentLoadStatuses(segment, bufferRanges);
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

export function getLoadBufferRanges(
  playback: Readonly<Playback>,
  settings: Pick<
    Settings,
    "highDemandTimeWindow" | "httpDownloadTimeWindow" | "p2pDownloadTimeWindow"
  >
): LoadBufferRanges {
  const { position, rate } = playback;
  const {
    highDemandTimeWindow,
    httpDownloadTimeWindow,
    p2pDownloadTimeWindow,
  } = settings;

  const getRange = (position: number, rate: number, bufferLength: number) => {
    return {
      from: position,
      to: position + rate * bufferLength,
    };
  };
  return {
    highDemand: getRange(position, rate, highDemandTimeWindow),
    http: getRange(position, rate, httpDownloadTimeWindow),
    p2p: getRange(position, rate, p2pDownloadTimeWindow),
  };
}

export function getSegmentLoadStatuses(
  segment: Readonly<Segment>,
  loadBufferRanges: LoadBufferRanges
): QueueItemStatuses {
  const { highDemand, http, p2p } = loadBufferRanges;
  const { startTime, endTime } = segment;

  const isValueInRange = (value: number, range: NumberRange) =>
    value >= range.from && value < range.to;

  return {
    isHighDemand:
      isValueInRange(startTime, highDemand) ||
      isValueInRange(endTime, highDemand),
    isHttpDownloadable:
      isValueInRange(startTime, http) || isValueInRange(endTime, http),
    isP2PDownloadable:
      isValueInRange(startTime, p2p) || isValueInRange(endTime, p2p),
  };
}

function isNotActualStatuses(statuses: QueueItemStatuses) {
  const { isHighDemand, isHttpDownloadable, isP2PDownloadable } = statuses;
  return !isHighDemand && !isHttpDownloadable && !isP2PDownloadable;
}

export function isSegmentActual(
  segment: Readonly<Segment>,
  bufferRanges: LoadBufferRanges
) {
  const { startTime, endTime } = segment;
  const { highDemand, p2p, http } = bufferRanges;

  const isInRange = (value: number) => {
    return (
      value > highDemand.from &&
      (value < highDemand.to || value < http.to || value < p2p.to)
    );
  };

  return isInRange(startTime) || isInRange(endTime);
}
