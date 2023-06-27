import { ByteRange, StreamType } from "../types/types";

export class Segment {
  streamLocalId: number;
  localId: string;
  url: string;
  index: number;

  constructor({
    url,
    localId,
    streamLocalId,
    index,
  }: {
    url: string;
    localId: string;
    streamLocalId: number;
    index: number;
  }) {
    this.url = url;
    this.localId = localId;
    this.streamLocalId = streamLocalId;
    this.index = index;
  }

  static create({
    stream,
    segmentReference,
    index,
    localId: segmentLocalId,
  }: {
    stream: shaka.extern.Stream;
    segmentReference: shaka.media.SegmentReference;
    index: number;
    localId?: string;
  }) {
    const [uri] = segmentReference.getUris();
    const localId =
      segmentLocalId ??
      Segment.getLocalIdFromSegmentReference(segmentReference);
    return new Segment({ localId, url: uri, streamLocalId: stream.id, index });
  }

  static getLocalIdFromSegmentReference(
    segmentReference: shaka.media.SegmentReference
  ) {
    const [uri] = segmentReference.getUris();
    const offset = segmentReference.getStartByte();
    const length = segmentReference.getEndByte() ?? undefined;
    return Segment.getLocalId(uri, { offset, length });
  }

  static getLocalId(url: string, byteRange?: ByteRange) {
    if (!byteRange) return url;
    const { offset, length } = byteRange;
    if (length !== undefined) return `${url}|${offset}-${length ?? ""}`;
    return url;
  }

  static getByteRangeFromHeaderString(
    rangeStr: string | undefined
  ): ByteRange | undefined {
    if (rangeStr && rangeStr.includes("bytes=")) {
      const range = rangeStr
        .split("=")[1]
        .split("-")
        .map((i) => parseInt(i));
      const [offset, length] = range;
      return { offset, length };
    }
  }
}

export class Stream {
  id: string;
  localId: number;
  type: StreamType;
  segments: Map<string, Segment> = new Map();

  constructor({
    localId,
    manifestUrl,
    order,
    type,
  }: {
    localId: number;
    manifestUrl: string;
    order: number;
    type: StreamType;
  }) {
    this.localId = localId;
    this.type = type;
    this.id = `${manifestUrl}-${type}-V${order}`;
  }
}
