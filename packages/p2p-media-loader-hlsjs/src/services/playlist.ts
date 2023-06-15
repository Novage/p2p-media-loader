import { Segment as ParserSegment } from "m3u8-parser";

export class Playlist {
  id: string;
  index: number;
  type: SegmentType;
  requestUrl: string;
  responseUrl?: string;
  segmentsMap: Map<string, Segment> = new Map<string, Segment>();
  sequence: number;

  constructor({
    type,
    url,
    manifestUrl,
    sequence,
    index,
  }: {
    type: SegmentType;
    url: string;
    manifestUrl?: { request: string; response: string };
    sequence: number;
    index: number;
  }) {
    this.type = type;
    this.index = index;
    this.requestUrl = new URL(url, manifestUrl?.response).toString();
    this.id = manifestUrl?.request
      ? `${getUrlWithoutParameters(manifestUrl.request)}-${type}-V${index}`
      : getUrlWithoutParameters(this.requestUrl);
    this.sequence = sequence;
  }

  setSegments(
    playlistResponseUrl: string,
    sequence: number,
    segments: ParserSegment[]
  ) {
    this.responseUrl = playlistResponseUrl;
    this.sequence = sequence;
    const mapEntries = segments.map<[string, Segment]>((s, index) => {
      const segment = new Segment({
        uri: s.uri,
        playlistUrl: playlistResponseUrl,
        byteRange: s.byterange,
        sequence: sequence + index,
      });
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
  sequence: number;

  constructor({
    uri,
    byteRange,
    playlistUrl,
    sequence,
  }: {
    uri: string;
    playlistUrl: string;
    byteRange?: ByteRange;
    sequence: number;
  }) {
    this.uri = uri;
    this.sequence = sequence;
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
