import { Segment, Stream, StreamWithSegments } from "../types";

const PEER_PROTOCOL_VERSION = "V1";

export function getStreamExternalId(
  manifestResponseUrl: string,
  stream: Readonly<Stream>
): string {
  const { type, index } = stream;
  return `${PEER_PROTOCOL_VERSION}:${manifestResponseUrl}-${type}-${index}`;
}

export function getSegmentFromStreamsMap(
  streams: Map<string, StreamWithSegments>,
  segmentId: string
): Segment | undefined {
  for (const stream of streams.values()) {
    const segment = stream.segments.get(segmentId);
    if (segment) return segment;
  }
}

export function getSegmentFromStreamByExternalId(
  stream: StreamWithSegments,
  segmentExternalId: string
): Segment | undefined {
  for (const segment of stream.segments.values()) {
    if (segment.externalId === segmentExternalId) return segment;
  }
}

export function getStreamShortId(stream: Stream) {
  return `${stream.type}-${stream.index}`;
}
