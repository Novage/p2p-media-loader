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

  getPlaylistBySegmentUrl(segmentUrl: string): Playlist | null {
    for (const playlist of this.playlists) {
      if (playlist.segmentsMap.has(segmentUrl)) return playlist;
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
      const segment = new Segment(this.type, s.uri, this.url);
      return [segment.url, segment];
    });
    this.segmentsMap = new Map(mapEntries);
  }
}

class Segment {
  url: string;
  uri: string;
  type: SegmentType;

  constructor(type: SegmentType, uri: string, playlistUrl: string) {
    this.type = type;
    this.uri = uri;
    this.url = new URL(uri, playlistUrl).toString();
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
