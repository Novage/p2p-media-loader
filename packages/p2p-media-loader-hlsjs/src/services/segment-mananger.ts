import { MasterManifest, Parser } from "m3u8-parser";
import * as ManifestUtil from "./manifest-util";
import { Playlist } from "./playlist";

export class SegmentManager {
  manifestUrl?: string;
  manifest?: MasterManifest;
  playlists: Map<string, Playlist> = new Map();

  processPlaylist(content: string, requestUrl: string, responseUrl: string) {
    const parser = new Parser();
    parser.push(content);
    parser.end();

    const { manifest } = parser;
    if (ManifestUtil.isMasterManifest(manifest)) {
      this.manifestUrl = responseUrl;
      this.manifest = manifest;
      const playlists = [
        ...ManifestUtil.getVideoPlaylistsFromMasterManifest(
          this.manifestUrl,
          manifest
        ),
        ...ManifestUtil.getAudioPlaylistsFromMasterManifest(
          this.manifestUrl,
          manifest
        ),
      ];

      playlists.forEach((p) => {
        const playlist = this.playlists.get(p.url);
        if (!playlist) {
          this.playlists.set(p.url, p);
        } else {
          p.segmentsMap = playlist.segmentsMap;
          this.playlists.set(p.url, p);
        }
      });
    } else if (ManifestUtil.isPlaylistManifest(manifest)) {
      const { segments, mediaSequence } = manifest;
      let playlist = this.playlists.get(responseUrl);

      if (!playlist && !this.manifest) {
        playlist = new Playlist({
          type: "unknown",
          url: responseUrl,
          manifestUrl: this.manifestUrl,
          mediaSequence,
          index: -1,
        });
        this.playlists.set(responseUrl, playlist);
      }

      if (playlist) playlist.setSegments(segments);
    }
  }

  getPlaylistBySegmentId(segmentId: string): Playlist | undefined {
    for (const playlist of this.playlists.values()) {
      if (playlist.segmentsMap.has(segmentId)) return playlist;
    }
  }
}
