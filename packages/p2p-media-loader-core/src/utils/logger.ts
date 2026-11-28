import { Stream } from "../types.js";
import { SegmentWithStream } from "../internal-types.js";

export function getStreamString(stream: Stream) {
  return stream.streamId;
}

export function getSegmentString(segment: SegmentWithStream) {
  const { externalId } = segment;
  return `(${getStreamString(segment.stream)} | ${externalId})`;
}
