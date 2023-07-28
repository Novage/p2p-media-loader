import { ByteRange, HookedStream, StreamType } from "../types/types";

export class Segment {
  streamLocalId: number;
  localId: string;
  byteRange?: ByteRange;
  url: string;
  index: number;

  constructor({
    url,
    localId,
    streamLocalId,
    index,
    byteRange,
  }: {
    url: string;
    localId?: string;
    streamLocalId: number;
    index: number;
    byteRange?: ByteRange;
  }) {
    this.url = url;
    this.streamLocalId = streamLocalId;
    this.index = index;

    if (
      byteRange &&
      byteRange.start !== undefined &&
      byteRange.end !== undefined
    ) {
      this.byteRange = byteRange;
    }
    this.localId = localId ?? Segment.getLocalId(url, byteRange);
  }

  static create({
    stream,
    segmentReference,
    index,
    localId,
  }: {
    stream: shaka.extern.Stream;
    segmentReference: shaka.media.SegmentReference;
    index: number;
    localId?: string;
  }) {
    const { uri, byteRange } =
      Segment.getSegmentInfoFromReference(segmentReference);
    return new Segment({
      localId,
      byteRange,
      url: uri,
      streamLocalId: stream.id,
      index,
    });
  }

  static getLocalIdFromSegmentReference(
    segmentReference: shaka.media.SegmentReference
  ) {
    const { uri, byteRange } =
      Segment.getSegmentInfoFromReference(segmentReference);
    return Segment.getLocalId(uri, byteRange);
  }

  static getLocalId(url: string, byteRange?: ByteRange | string) {
    if (!byteRange) return url;

    let range: ByteRange | undefined;
    if (typeof byteRange === "string") {
      range = Segment.getByteRangeFromHeaderString(byteRange);
    } else if (byteRange.start !== undefined && byteRange.end !== undefined) {
      range = byteRange;
    }
    if (!range) return url;

    const { start, end } = range;
    if (length !== undefined) return `${url}|${start}-${end}`;
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
      const [start, end] = range;
      return { start, end };
    }
  }

  static getSegmentInfoFromReference(
    segmentReference: shaka.media.SegmentReference
  ) {
    const [uri] = segmentReference.getUris();
    const start = segmentReference.getStartByte();
    const end = segmentReference.getEndByte() ?? undefined;

    return {
      byteRange: end !== undefined ? { start, end } : undefined,
      uri,
    };
  }
}

export class Stream {
  id: string;
  localId: number;
  type: StreamType;
  segments: Map<string, Segment> = new Map();
  shakaStream: HookedStream;
  url?: string;
  firstMediaSequence?: number;
  bitrate: number;

  constructor({
    localId,
    manifestUrl,
    order,
    type,
    url,
    shakaStream,
    bitrate,
  }: {
    localId: number;
    manifestUrl: string;
    order: number;
    type: StreamType;
    url?: string;
    shakaStream: shaka.extern.Stream;
    bitrate: number;
  }) {
    this.localId = localId;
    this.type = type;
    this.id = `${manifestUrl}-${type}-V${order}`;
    this.url = url;
    this.shakaStream = shakaStream;
    this.bitrate = bitrate;
  }

  getLastMediaSequence() {
    const map =
      this.shakaStream.mediaSequenceTimeMap ?? new Map<number, number>();

    let firstMediaSequence = this.firstMediaSequence;
    if (firstMediaSequence !== undefined) {
      return firstMediaSequence + map.size - 1;
    } else if (map.size) {
      firstMediaSequence = [...map.keys()][0];
      this.firstMediaSequence = firstMediaSequence;
      return firstMediaSequence + map.size - 1;
    }
  }
}
