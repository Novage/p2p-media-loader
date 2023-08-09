import {
  Stream as CoreStream,
  Segment as CoreSegment,
} from "p2p-media-loader-core";

type SegmentType = "video" | "audio";
export type ByteRange = { start: number; end: number };

function getUrlWithoutParameters(url: string) {
  return url.split("?")[0];
}

export class Stream implements CoreStream {
  id: string;
  globalId: string;
  index: number;
  type: SegmentType;
  segments: Map<string, Segment> = new Map();

  constructor({
    masterManifestUrl,
    index,
    type,
    id,
  }: {
    masterManifestUrl: string;
    index: number;
    type: SegmentType;
    id: string;
  }) {
    this.index = index;
    this.type = type;
    this.globalId = `${getUrlWithoutParameters(
      masterManifestUrl
    )}-${type}-V${index}`;
    this.id = id;
  }
}

export class Segment implements CoreSegment {
  id: string;
  index: number;
  url: string;
  byteRange?: ByteRange;

  constructor({
    segmentUrl,
    index,
    byteRange,
    id,
  }: {
    segmentUrl: string;
    index: number;
    byteRange?: ByteRange;
    id?: string;
  }) {
    this.index = index;
    this.id = id ?? Segment.getSegmentLocalId(segmentUrl, byteRange);
    this.url = segmentUrl;
    this.byteRange = byteRange;
  }

  static getSegmentLocalId(
    segmentRequestUrl: string,
    byteRange?: Partial<ByteRange>
  ) {
    if (!byteRange || !byteRange.start || !byteRange.end) {
      return segmentRequestUrl;
    }
    return `${segmentRequestUrl}|${byteRange.start}-${byteRange.end}`;
  }
}
