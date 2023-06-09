import {
  Parser,
  type PlaylistManifest,
  type MasterManifest,
  type Segment,
} from "m3u8-parser";

export class SegmentManager {
  manifest?: Manifest;

  processPlaylist(content: string, requestUrl: string, responseUrl: string) {
    const parser = new Parser();
    parser.push(content);
    parser.end();

    const { manifest } = parser;
    if (TypeGuard.isMasterManifest(manifest)) {
      this.manifest = new Manifest(responseUrl, manifest);
    } else {
      const playlist = this.manifest?.getPlaylist(responseUrl);
      if (playlist) playlist.setSegments(manifest.segments);
    }
  }
}

class Manifest {
  url: string;
  playlists: Playlist[];
  playlistsMap: Map<string, Playlist>;
  audioPlaylists?: Playlist[];
  audioPlaylistsMap?: Map<string, Playlist>;

  constructor(url: string, manifest: MasterManifest) {
    this.url = url;
    const { playlists: videoPlaylists, mediaGroups } = manifest;
    const audioPlaylists = Object.values(mediaGroups.AUDIO);

    this.playlists = videoPlaylists.map(
      (p) => new Playlist("video", p.uri, url)
    );
    this.playlistsMap = new Map(
      this.playlists.map<[string, Playlist]>((p) => [p.url, p])
    );

    if (audioPlaylists.length) {
      this.audioPlaylists = [];
      audioPlaylists.forEach((languageMap) => {
        const languages = Object.values(languageMap);
        languages.forEach((i) => {
          this.audioPlaylists?.push(new Playlist("audio", i.uri, url));
        });
      });

      this.audioPlaylistsMap = new Map(
        this.audioPlaylists.map<[string, Playlist]>((p) => [p.url, p])
      );
    }
  }

  getPlaylist(playlistUrl: string) {
    return (
      this.playlistsMap.get(playlistUrl) ??
      this.audioPlaylistsMap?.get(playlistUrl) ??
      null
    );
  }

  getPlaylistBySegmentUrl(segmentUrl: string) {
    return (
      this.playlists.find((p) => p.segmentsMap.has(segmentUrl)) ??
      this.audioPlaylists?.find((p) => p.segmentsMap.has(segmentUrl)) ??
      null
    );
  }

  getSegment(segmentUrl: string) {
    for (
      let i = 0;
      i < this.playlists.length ||
      (!!this.audioPlaylists && i < this.audioPlaylists.length);
      i++
    ) {
      const segment =
        this.playlists[i].segmentsMap.get(segmentUrl) ??
        this.audioPlaylists?.[i].segmentsMap.get(segmentUrl);
      if (segment) return segment;
    }
    return null;
  }
}

class Playlist {
  uri: string;
  url: string;
  type: SegmentType;
  segmentsMap: Map<string, Segment1> = new Map<string, Segment1>();

  constructor(type: SegmentType, uri: string, baseUrl: string) {
    this.type = type;
    this.uri = uri;
    this.url = new URL(uri, baseUrl).toString();
  }

  setSegments(segments: Segment[]) {
    const mapEntries = segments.map<[string, Segment1]>((s) => {
      const segment = new Segment1(this.type, s.uri, this.url);
      return [segment.url, segment];
    });
    this.segmentsMap = new Map(mapEntries);
  }
}

class Segment1 {
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
