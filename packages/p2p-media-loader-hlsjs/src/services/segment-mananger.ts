import {
  Parser,
  type PlaylistManifest,
  type MasterManifest,
  type Segment as ParserSegment,
} from "m3u8-parser";

export class SegmentManager {
  videoPlaylists: VideoPlaylistsContainer = new VideoPlaylistsContainer();
  audioPlaylists: AudioPlaylistsContainer = new AudioPlaylistsContainer();

  processPlaylist(content: string, requestUrl: string, responseUrl: string) {
    const parser = new Parser();
    parser.push(content);
    parser.end();

    const { manifest } = parser;
    if (TypeGuard.isMasterManifest(manifest)) {
      this.videoPlaylists.setFromMasterManifest(responseUrl, manifest);
      this.audioPlaylists.setFromMasterManifest(responseUrl, manifest);
    } else {
      const playlist =
        this.videoPlaylists?.getPlaylist(responseUrl) ??
        this.audioPlaylists?.getPlaylist(responseUrl);
      if (playlist) playlist.setSegments(manifest.segments);
    }
  }
}

abstract class PlaylistsContainer {
  masterPlaylistUrl?: string;
  playlists: Playlist[] = [];
  playlistMap: Map<string, Playlist> = new Map<string, Playlist>();

  abstract setFromMasterManifest(
    masterManifestUrl: string,
    masterManifest: MasterManifest
  ): void;

  getPlaylist(playlistUrl: string): Playlist | null {
    return this.playlistMap.get(playlistUrl) ?? null;
  }

  getPlaylistBySegmentId(segmentId: string): Playlist | null {
    for (const playlist of this.playlists) {
      if (playlist.segmentsMap.has(segmentId)) return playlist;
    }
    return null;
  }
}

class AudioPlaylistsContainer extends PlaylistsContainer {
  setFromMasterManifest(
    masterManifestUrl: string,
    masterManifest: MasterManifest
  ) {
    this.masterPlaylistUrl = masterManifestUrl;
    const { mediaGroups } = masterManifest;

    const audioPlaylists = Object.values(mediaGroups.AUDIO);
    if (audioPlaylists.length) {
      this.playlists = [];
      audioPlaylists.forEach((languageMap) => {
        const languages = Object.values(languageMap);
        languages.forEach((i) => {
          this.playlists?.push(new Playlist("audio", i.uri, masterManifestUrl));
        });
      });

      this.playlistMap = new Map(
        this.playlists.map<[string, Playlist]>((p) => [p.url, p])
      );
    }
  }
}

class VideoPlaylistsContainer extends PlaylistsContainer {
  setFromMasterManifest(
    masterManifestUrl: string,
    masterManifest: MasterManifest
  ) {
    this.masterPlaylistUrl = masterManifestUrl;
    const { playlists } = masterManifest;

    this.playlists = playlists.map(
      (p) => new Playlist("video", p.uri, masterManifestUrl)
    );
    this.playlistMap = new Map(
      this.playlists.map<[string, Playlist]>((p) => [p.url, p])
    );
  }
}

class Playlist {
  uri: string;
  url: string;
  type: SegmentType;
  segmentsMap: Map<string, Segment> = new Map<string, Segment>();

  constructor(type: SegmentType, uri: string, baseUrl: string) {
    this.type = type;
    this.uri = uri;
    this.url = new URL(uri, baseUrl).toString();
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

class TypeGuard {
  static isMasterManifest(
    manifest: PlaylistManifest | MasterManifest
  ): manifest is MasterManifest {
    return (
      !!(manifest as MasterManifest).playlists &&
      !!(manifest as MasterManifest).mediaGroups
    );
  }
}

type SegmentType = "video" | "audio";

export type ByteRange = { offset: number; length: number };
