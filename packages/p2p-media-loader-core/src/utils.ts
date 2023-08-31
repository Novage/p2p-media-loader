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
