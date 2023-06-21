export class Segment {
  streamId: number;
  localId: string;
  url: string;

  constructor({
    url,
    localId,
    streamId,
  }: {
    url: string;
    localId: string;
    streamId: number;
  }) {
    this.url = url;
    this.localId = localId;
    this.streamId = streamId;
  }

  static create(
    stream: shaka.extern.Stream,
    segmentReference: shaka.media.SegmentReference
  ) {
    const [uri] = segmentReference.getUris();
    const localId = Segment.getLocalIdFromSegmentReference(segmentReference);
    return new Segment({ localId, url: uri, streamId: stream.id });
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

type ByteRange = { offset: number; length?: number };

export class Stream {
  id: number;
  segments: Map<string, Segment> = new Map();

  constructor(id: number) {
    this.id = id;
  }
}
