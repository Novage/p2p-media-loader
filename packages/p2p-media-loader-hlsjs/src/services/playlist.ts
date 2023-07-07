type SegmentType = "video" | "audio";

export type ByteRange = { start: number; end: number };

function getUrlWithoutParameters(url: string) {
  return url.split("?")[0];
}

export class Playlist {
  id: string;
  index: number;
  type: SegmentType;
  bitrate: number;
  segments: Map<string, Segment> = new Map();

  constructor({
    masterManifestUrl,
    index,
    type,
    bitrate,
  }: {
    masterManifestUrl: string;
    index: number;
    type: SegmentType;
    bitrate: number;
  }) {
    this.index = index;
    this.type = type;
    this.id = `${getUrlWithoutParameters(masterManifestUrl)}-${type}-V${index}`;
    this.bitrate = bitrate;
  }
}

export class Segment {
  localId: string;
  index: number;

  constructor({
    segmentUrl,
    index,
    byteRange,
    localId,
  }: {
    segmentUrl: string;
    index: number;
    byteRange?: ByteRange;
    localId?: string;
  }) {
    this.index = index;
    this.localId = localId ?? Segment.getSegmentLocalId(segmentUrl, byteRange);
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
