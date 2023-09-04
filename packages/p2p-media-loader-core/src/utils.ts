import { Segment, Stream, StreamWithSegments } from "./index";
import { SegmentLoadStatus } from "./internal-types";
import { Playback } from "./playback";

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

export function getSegmentLoadStatuses(segment: Segment, playback: Playback) {
  const { position } = playback;
  const { highDemand, http, p2p } = playback.margins;
  const { startTime, endTime } = segment;

  const statuses = new Set<SegmentLoadStatus>();
  const isValueBetween = (value: number, from: number, to: number) =>
    value >= from && value < to;

  if (
    isValueBetween(startTime, position, highDemand) ||
    isValueBetween(endTime, position, highDemand)
  ) {
    statuses.add("high-demand");
  }
  if (
    isValueBetween(startTime, position, http) ||
    isValueBetween(endTime, position, http)
  ) {
    statuses.add("http-downloadable");
  }
  if (
    isValueBetween(startTime, position, p2p) ||
    isValueBetween(endTime, position, p2p)
  ) {
    statuses.add("p2p-downloadable");
  }
  if (statuses.size) return statuses;
}
