import { Playlist, Segment, SegmentType } from "./playlist";
import type {
  ManifestLoadedData,
  LevelUpdatedData,
  AudioTrackLoadedData,
} from "hls.js";
import { Fragment } from "hls.js";

export class SegmentManager {
  playlists: Map<string, Playlist> = new Map();
  playback: Playback = new Playback();

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

  updatePlaylist(data: LevelUpdatedData | AudioTrackLoadedData) {
    if (!data.details) return;
    const {
      details: { url, fragments, live },
    } = data;

    const playlist = this.playlists.get(url);
    if (!playlist) return;

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
        index: live ? sn : index,
        ...(start && end ? { byteRange: { start, end } } : {}),
      });
      playlist.segments.set(segment.localId, segment);
    });

    segmentToRemoveIds.forEach((value) => playlist.segments.delete(value));
  }

  setPlayhead(position: number, frag: Fragment) {
    const [start, end] = frag.byteRange;
    const segmentId = Segment.getSegmentLocalId(frag.url, { start, end });
    const playlist = this.getPlaylistBySegmentId(segmentId);
    const segment = playlist?.segments.get(segmentId);
    if (!playlist || !segment) return;
    this.playback.setPlayheadPosition(position, segment, playlist.type);
  }

  destroy() {
    this.playlists.clear();
  }
}

class Playback {
  playheadPosition?: number;
  videoSegment?: Segment;
  audioSegment?: Segment;

  setPlayheadPosition(
    position: number,
    segment: Segment,
    playlistType: SegmentType
  ) {
    this.playheadPosition = position;
    this.videoSegment = segment;
    if (playlistType === "video") this.videoSegment = segment;
    else this.audioSegment = segment;
  }
}
