type SegmentType = "video" | "audio";

export type ByteRange = { start: number; end: number };

function getUrlWithoutParameters(url: string) {
  return url.split("?")[0];
}

export class Playlist {
  id: string;
  index: number;
  type: SegmentType;
  segments: Map<string, Segment> = new Map();

  constructor({
    masterManifestUrl,
    index,
    type,
  }: {
    masterManifestUrl: string;
    index: number;
    type: SegmentType;
  }) {
    this.index = index;
    this.type = type;
    this.id = `${getUrlWithoutParameters(masterManifestUrl)}-${type}-V${index}`;
  }
}

export class Segment {
  localId: string;
  index: number;

  constructor({
    segmentUrl,
    index,
    byteRange,
  }: {
    segmentUrl: string;
    index: number;
    byteRange?: ByteRange;
  }) {
    this.index = index;
    this.localId = byteRange
      ? `${segmentUrl}|${byteRange.start}-${byteRange.end}`
      : segmentUrl;
  }

  static getSegmentLocalId(
    segmentRequestUrl: string,
    byteRange?: Partial<ByteRange>
  ) {
    if (!byteRange || !byteRange.start) return segmentRequestUrl;
    return `${segmentRequestUrl}|${byteRange.start}-${byteRange.end}`;
  }
}
