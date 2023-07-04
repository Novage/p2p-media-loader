import { Playlist, Segment } from "./playlist";
import { LevelLoadedData, ManifestLoadedData } from "hls.js";

export class SegmentManager {
  playlists: Map<string, Playlist> = new Map();

  getPlaylistBySegmentId(segmentId: string): Playlist | undefined {
    for (const playlist of this.playlists.values()) {
      if (playlist.segments.has(segmentId)) return playlist;
    }
  }

  processMasterManifest(data: ManifestLoadedData) {
    const { levels, audioTracks, url } = data;
    levels.forEach((level, index) => {
      if (this.playlists.has(level.url)) return;
      this.playlists.set(
        level.url,
        new Playlist({ type: "video", index, masterManifestUrl: url })
      );
    });

    audioTracks.forEach((track, index) => {
      if (this.playlists.has(track.url)) return;
      this.playlists.set(
        track.url,
        new Playlist({ type: "audio", index, masterManifestUrl: url })
      );
    });
  }

  setPlaylist(data: LevelLoadedData) {
    const {
      details: { url, fragments },
    } = data;
    const playlist = this.playlists.get(url);
    if (!playlist) return;

    fragments.forEach((fragment) => {
      const { url, byteRange, sn } = fragment;
      if (sn === "initSegment") return;

      const [start, end] = byteRange;
      const segment = new Segment({
        segmentUrl: url,
        index: sn,
        ...(start && end ? { byteRange: { start, end } } : {}),
      });

      playlist.segments.set(segment.localId, segment);
    });
  }
}
