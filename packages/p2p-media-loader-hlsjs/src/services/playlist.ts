import { Segment as ParserSegment } from "m3u8-parser";

export class Playlist {
  id: string;
  index: number;
  type: SegmentType;
  url: string;
  segmentsMap: Map<string, Segment> = new Map<string, Segment>();
  mediaSequence: number;

  constructor({
    type,
    url,
    manifestUrl,
    mediaSequence,
    index,
  }: {
    type: SegmentType;
    url: string;
    manifestUrl?: { request: string; response: string };
    mediaSequence: number;
    index: number;
  }) {
    this.type = type;
    this.index = index;
    this.url = new URL(url, manifestUrl?.response).toString();
    this.id = this.id = manifestUrl?.request
      ? `${getUrlWithoutParameters(manifestUrl.request)}-${type}-V${index}`
      : getUrlWithoutParameters(this.url);
    this.mediaSequence = mediaSequence;
  }

  setSegments(segments: ParserSegment[]) {
    const mapEntries = segments.map<[string, Segment]>((s) => {
      const segment = new Segment(s.uri, this.url, s.byterange);
      return [segment.localId, segment];
    });
    this.segmentsMap = new Map(mapEntries);
  }
}

export class Segment {
  localId: string;
  url: string;
  uri: string;
  byteRange?: ByteRange;

  constructor(uri: string, playlistUrl: string, byteRange?: ByteRange) {
    this.uri = uri;
    this.url = new URL(uri, playlistUrl).toString();
    this.byteRange = byteRange;
    this.localId = Segment.getSegmentLocalId(this.url, this.byteRange);
  }

  static getSegmentLocalId(segmentRequestUrl: string, byteRange?: ByteRange) {
    if (!byteRange) return segmentRequestUrl;
    const end = byteRange.offset + byteRange.length - 1;
    return `${segmentRequestUrl}|${byteRange.offset}-${end}`;
  }

  static getByteRange(
    rangeStart?: number,
    rangeEnd?: number
  ): ByteRange | undefined {
    if (
      rangeStart === undefined ||
      rangeEnd === undefined ||
      rangeStart >= rangeEnd
    ) {
      return undefined;
    }
    return { offset: rangeStart, length: rangeEnd - rangeStart };
  }
}

type SegmentType = "video" | "audio" | "unknown";

export type ByteRange = { offset: number; length: number };

function getUrlWithoutParameters(url: string) {
  return url.split("?")[0];
}
