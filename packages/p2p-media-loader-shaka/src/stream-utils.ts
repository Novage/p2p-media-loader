import { HookedStream, Stream } from "./types";
import {
  SegmentBase,
  StreamWithReadonlySegments,
  ByteRange,
} from "p2p-media-loader-core";

export function createSegment({
  segmentReference,
  externalId,
  localId,
}: {
  segmentReference: shaka.media.SegmentReference;
  externalId: number;
  localId?: string;
}): SegmentBase {
  const { byteRange, url, startTime, endTime } =
    getSegmentInfoFromReference(segmentReference);
  return {
    localId: localId ?? getSegmentLocalId(url, byteRange),
    externalId,
    url,
    startTime,
    endTime,
  };
}

export function getSegmentLocalIdFromReference(
  segmentReference: shaka.media.SegmentReference
) {
  const { url, byteRange } = getSegmentInfoFromReference(segmentReference);
  return getSegmentLocalId(url, byteRange);
}

export function getSegmentLocalId(url: string, byteRange?: ByteRange | string) {
  if (!byteRange) return url;

  const range: ByteRange | undefined =
    typeof byteRange === "string"
      ? getByteRangeFromHeaderString(byteRange)
      : byteRange;

  if (!range) return url;
  return `${url}|${range.start}-${range.end}`;
}

export function getByteRangeFromHeaderString(
  rangeStr: string | undefined
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
  segmentReference: shaka.media.SegmentReference
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
  stream: StreamWithReadonlySegments<Stream>
): number | undefined {
  const { shakaStream } = stream;
  const map = shakaStream.mediaSequenceTimeMap;

  if (map) {
    const firstMediaSequence = map.keys().next().value as number | undefined;
    if (firstMediaSequence === undefined) return;
    return firstMediaSequence + map.size - 1;
  }
}

export function getStreamLocalIdFromShakaStream(
  stream: shaka.extern.Stream | HookedStream,
  isHls: boolean
): string {
  if (isHls) {
    const streamUrl = (stream as HookedStream).streamUrl;
    if (!streamUrl) {
      throw Error("Stream url must be set for HLS stream");
    }
    return streamUrl;
  }
  return stream.id.toString();
}
