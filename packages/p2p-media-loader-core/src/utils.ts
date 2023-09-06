import { Segment, Settings, Stream, StreamWithSegments } from "./index";
import {
  SegmentLoadStatus,
  Playback,
  LoadBufferRanges,
  QueueItem,
  NumberRange,
} from "./internal-types";
import { SegmentsMemoryStorage } from "./segments-storage";

export function getStreamExternalId(
  stream: Stream,
  manifestResponseUrl: string
): string {
  const { type, index } = stream;
  return `${manifestResponseUrl}-${type}-${index}`;
}

export function getSegmentFromStreamsMap(
  streams: Map<string, StreamWithSegments>,
  segmentId: string
): { segment: Segment; stream: StreamWithSegments } | undefined {
  for (const stream of streams.values()) {
    const segment = stream.segments.get(segmentId);
    if (segment) return { segment, stream };
  }
}

export function generateQueue({
  segment,
  stream,
  playback,
  settings,
  segmentStorage,
}: {
  stream: Readonly<StreamWithSegments>;
  segment: Readonly<Segment>;
  playback: Readonly<Playback>;
  segmentStorage: Readonly<SegmentsMemoryStorage>;
  settings: Pick<
    Settings,
    "highDemandBufferLength" | "httpBufferLength" | "p2pBufferLength"
  >;
}) {
  const bufferRanges = getLoadBufferRanges(playback, settings);
  const { localId: requestedSegmentId } = segment;

  const queue: QueueItem[] = [];
  const queueSegmentIds = new Set<string>();

  const nextSegment = stream.segments.getNextTo(segment.localId)?.[1];
  const isNextSegmentHighDemand = !!(
    nextSegment &&
    getSegmentLoadStatuses(nextSegment, bufferRanges)?.has("high-demand")
  );

  let i = 0;
  for (const segment of stream.segments.values(requestedSegmentId)) {
    const statuses = getSegmentLoadStatuses(segment, bufferRanges);
    if (!statuses && !(i === 0 && isNextSegmentHighDemand)) break;
    if (segmentStorage.has(segment.localId)) continue;

    queueSegmentIds.add(segment.localId);
    queue.push({ segment, statuses: statuses ?? new Set(["high-demand"]) });
    i++;
  }

  return { queue, queueSegmentIds };
}

export function getLoadBufferRanges(
  playback: Readonly<Playback>,
  settings: Pick<
    Settings,
    "highDemandBufferLength" | "httpBufferLength" | "p2pBufferLength"
  >
): LoadBufferRanges {
  const { position, rate } = playback;
  const { highDemandBufferLength, httpBufferLength, p2pBufferLength } =
    settings;

  const getRange = (position: number, rate: number, bufferLength: number) => {
    return {
      from: position,
      to: position + rate * bufferLength,
    };
  };
  return {
    highDemand: getRange(position, rate, highDemandBufferLength),
    http: getRange(position, rate, httpBufferLength),
    p2p: getRange(position, rate, p2pBufferLength),
  };
}

export function getSegmentLoadStatuses(
  segment: Readonly<Segment>,
  loadBufferRanges: LoadBufferRanges
): Set<SegmentLoadStatus> | undefined {
  const { highDemand, http, p2p } = loadBufferRanges;
  const { startTime, endTime } = segment;

  const statuses = new Set<SegmentLoadStatus>();
  const isValueInRange = (value: number, range: NumberRange) =>
    value >= range.from && value < range.to;

  if (
    isValueInRange(startTime, highDemand) ||
    isValueInRange(endTime, highDemand)
  ) {
    statuses.add("high-demand");
  }
  if (isValueInRange(startTime, http) || isValueInRange(endTime, http)) {
    statuses.add("http-downloadable");
  }
  if (isValueInRange(startTime, p2p) || isValueInRange(endTime, p2p)) {
    statuses.add("p2p-downloadable");
  }
  if (statuses.size) return statuses;
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
