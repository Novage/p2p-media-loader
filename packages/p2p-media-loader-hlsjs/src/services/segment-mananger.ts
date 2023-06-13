import { Parser, Segment as ParserSegment } from "m3u8-parser";
import * as ManifestUtil from "./manifest-util";

export class SegmentManager {
  playlists: Map<string, Playlist> = new Map();

  processPlaylist(content: string, requestUrl: string, responseUrl: string) {
    const parser = new Parser();
    parser.push(content);
    parser.end();

    const { manifest } = parser;
    if (ManifestUtil.isMasterManifest(manifest)) {
      const playlists = [
        ...ManifestUtil.getVideoPlaylistsFromMasterManifest(
          responseUrl,
          manifest
        ),
        ...ManifestUtil.getAudioPlaylistsFromMasterManifest(
          responseUrl,
          manifest
        ),
      ];

      playlists.forEach((p) => {
        const playlist = this.playlists.get(p.url);
        if (!playlist) this.playlists.set(p.url, p);
        else if (playlist.type !== p.type) playlist.setType(p.type);
      });
    } else {
      const { segments, mediaSequence } = manifest;
      const playlist = this.playlists.get(responseUrl);

      if (playlist) {
        playlist.setSegments(segments);
      } else {
        const playlist = new Playlist(
          "unknown",
          responseUrl,
          undefined,
          mediaSequence
        );
        playlist.setSegments(segments);
        this.playlists.set(responseUrl, playlist);
      }
    }
  }

  getPlaylistBySegmentId(segmentId: string): Playlist | undefined {
    for (const playlist of this.playlists.values()) {
      if (playlist.segmentsMap.has(segmentId)) return playlist;
    }
  }
}

export class Playlist {
  url: string;
  type: SegmentType;
  segmentsMap: Map<string, Segment> = new Map<string, Segment>();
  mediaSequence: number;

  constructor(
    type: SegmentType,
    url: string,
    baseUrl: string | undefined,
    mediaSequence: number
  ) {
    this.type = type;
    this.url = new URL(url, baseUrl).toString();
    this.mediaSequence = mediaSequence;
  }

  setType(type: SegmentType) {
    this.type = type;
    for (const segment of this.segmentsMap.values()) {
      segment.type = type;
    }
  }

  setSegments(segments: ParserSegment[]) {
    const mapEntries = segments.map<[string, Segment]>((s) => {
      const segment = new Segment(this.type, s.uri, this.url, s.byterange);
      return [segment.id, segment];
    });
    this.segmentsMap = new Map(mapEntries);
  }
}

export class Segment {
  id: string;
  url: string;
  uri: string;
  type: SegmentType;
  byteRange?: ByteRange;

  constructor(
    type: SegmentType,
    uri: string,
    playlistUrl: string,
    byteRange?: ByteRange
  ) {
    this.type = type;
    this.uri = uri;
    this.url = new URL(uri, playlistUrl).toString();
    this.byteRange = byteRange;
    this.id = Segment.getSegmentId(this.url, this.byteRange);
  }

  static getSegmentId(url: string, byteRange?: ByteRange) {
    if (!byteRange) return url;
    const end = byteRange.offset + byteRange.length - 1;
    return `${url}?bytes=${byteRange.offset}-${end}`;
  }

  static getByteRange(
    rangeStart?: number,
    rangeEnd?: number
  ): ByteRange | undefined {
    if (
      rangeStart === undefined ||
      rangeEnd === undefined ||
      rangeStart >= rangeEnd
    )
      return undefined;
    return { offset: rangeStart, length: rangeEnd - rangeStart };
  }
}

type SegmentType = "video" | "audio" | "unknown";

export type ByteRange = { offset: number; length: number };
