import { Playlist, Segment } from "./playlist";
import type {
  ManifestLoadedData,
  LevelUpdatedData,
  MediaPlaylist,
  Fragment,
  LevelParsed,
} from "hls.js";

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
        new Playlist({
          type: "video",
          index,
          masterManifestUrl: url,
        })
      );
    });

    audioTracks.forEach((track, index) => {
      if (this.playlists.has(track.url)) return;
      this.playlists.set(
        track.url,
        new Playlist({
          type: "audio",
          index,
          masterManifestUrl: url,
        })
      );
    });
  }

  updatePlaylistByUrl(playlistUrl: string) {
    const hlsPlaylist = this.hlsjsPlaylists.get(playlistUrl);
    if (!hlsPlaylist) return;

    this.updateVideoPlaylist(hlsPlaylist);
    console.log(hlsPlaylist.details?.fragments.length);
    console.log("PLAYLIST UPDATED");
  }

  updateVideoPlaylist(data: LevelParsed | MediaPlaylist | LevelUpdatedData) {
    if (!data.details) return;
    const {
      details: { url, fragments, live },
    } = data;
    this.updatePlaylist({ url, fragments, isLive: live });
  }

  // updateAudioPlaylist(data: AudioTracksUpdatedData) {
  //   const { audioTracks } = data;
  //
  //   for (const track of audioTracks) {
  //     const { details, url } = track;
  //     console.log(details?.fragments.length ?? 0);
  //     if (!details || !details.fragments.length) continue;
  //
  //     this.updatePlaylist({ url, fragments: details.fragments, isLive: true });
  //   }
  // }

  private updatePlaylist({
    url,
    fragments,
    isLive,
  }: {
    url: string;
    fragments: Fragment[];
    isLive: boolean;
  }) {
    const playlist = this.playlists.get(url);
    if (!playlist) return;

    console.log(playlist);
    const segmentToRemoveIds = new Set(playlist.segments.keys());
    fragments.forEach((fragment, index) => {
      const { url, byteRange, sn } = fragment;
      if (sn === "initSegment") return;

      const [start, end] = byteRange;
      const segmentLocalId = Segment.getSegmentLocalId(url, { start, end });
      segmentToRemoveIds.delete(segmentLocalId);

      if (playlist.segments.has(segmentLocalId)) return;
      const segment = new Segment({
        segmentUrl: url,
        index: isLive ? sn : index,
        ...(start && end ? { byteRange: { start, end } } : {}),
      });
      playlist.segments.set(segment.localId, segment);
    });

    segmentToRemoveIds.forEach((value) => playlist.segments.delete(value));
  }
}
