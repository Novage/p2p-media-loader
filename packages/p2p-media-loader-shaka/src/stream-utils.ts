import { StreamWithReadonlySegments } from "./types";
import { Segment, ByteRange } from "p2p-media-loader-core";

export function createSegment({
  segmentReference,
  externalId,
  runtimeId,
}: {
  segmentReference: shaka.media.SegmentReference;
  externalId: number;
  runtimeId?: string;
}): Segment {
  const { byteRange, url, startTime, endTime } =
    getSegmentInfoFromReference(segmentReference);
  return {
    runtimeId: runtimeId ?? getSegmentRuntimeId(url, byteRange),
    externalId,
    byteRange,
    url,
    startTime,
    endTime,
  };
}

export function getSegmentRuntimeIdFromReference(
  segmentReference: shaka.media.SegmentReference,
) {
  const { url, byteRange } = getSegmentInfoFromReference(segmentReference);
  return getSegmentRuntimeId(url, byteRange);
}

export function getSegmentRuntimeId(
  url: string,
  byteRange?: ByteRange | string,
) {
  if (!byteRange) return url;

  const range: ByteRange | undefined =
    typeof byteRange === "string"
      ? getByteRangeFromHeaderString(byteRange)
      : byteRange;

  if (!range) return url;
  return `${url}|${range.start}-${range.end}`;
}

export function getByteRangeFromHeaderString(
  rangeStr: string | undefined,
): ByteRange | undefined {
  if (!rangeStr || !rangeStr.includes("bytes=")) return undefined;

  const range = rangeStr
    .split("=")[1]
    .split("-")
    .map((i) => parseInt(i));
  const [start, end] = range;
  return { start, end };
}

export function getSegmentInfoFromReference(
  segmentReference: shaka.media.SegmentReference,
) {
  const uris = segmentReference.getUris();
  const responseUrl = uris[1] ?? uris[0];
  const start = segmentReference.getStartByte();
  const end = segmentReference.getEndByte() ?? undefined;
  const startTime = segmentReference.getStartTime();
  const endTime = segmentReference.getEndTime();

  return {
    byteRange: end !== undefined ? { start, end } : undefined,
    url: responseUrl,
    startTime,
    endTime,
  };
}

export function getStreamLastMediaSequence(
  stream: StreamWithReadonlySegments,
): number | undefined {
  const { shakaStream } = stream;
  const map = shakaStream.mediaSequenceTimeMap;
  if (!map) return;

  const firstMediaSequence = map.keys().next().value as number | undefined;
  if (firstMediaSequence === undefined) return;
  return firstMediaSequence + map.size - 1;
}
