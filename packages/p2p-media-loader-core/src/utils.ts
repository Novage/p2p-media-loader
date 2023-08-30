import { Segment, Stream, StreamWithSegments } from "./index";
import { Playback } from "./playback";
import { SegmentLoadStatus } from "./internal-types";

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

export function getSegmentLoadStatuses(
  segment: Segment,
  playback: Playback
): Set<SegmentLoadStatus> | undefined {
  const { position, highDemandMargin, httpDownloadMargin, p2pDownloadMargin } =
    playback;
  const { startTime } = segment;
  const statuses = new Set<SegmentLoadStatus>();
  if (startTime >= position && startTime < highDemandMargin) {
    statuses.add("high-demand");
  }
  if (startTime >= position && startTime < httpDownloadMargin) {
    statuses.add("http-downloadable");
  }
  if (startTime >= position && startTime < p2pDownloadMargin) {
    statuses.add("p2p-downloadable");
  }
  if (statuses.size) return statuses;
}
