import { Playlist, Segment } from "./playlist";
import type {
  ManifestLoadedData,
  LevelUpdatedData,
  AudioTrackLoadedData,
} from "hls.js";
import { Playback } from "./playback";
import { Fragment } from "hls.js";

export class SegmentManager {
  playlists: Map<string, Playlist> = new Map();
  videoPlayback: Playback = new Playback();
  audioPlayback: Playback = new Playback();

  getPlaylistBySegmentId(segmentId: string): Playlist | undefined {
    for (const playlist of this.playlists.values()) {
      if (playlist.segments.has(segmentId)) return playlist;
    }
  }

  getSegmentById(segmentId: string): Segment | undefined {
    for (const playlist of this.playlists.values()) {
      const segment = playlist.segments.get(segmentId);
      if (segment) return segment;
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

    const staleSegmentIds = new Set(playlist.segments.keys());
    fragments.forEach((fragment, index) => {
      const { url, byteRange, sn } = fragment;
      if (sn === "initSegment") return;

      const [start, end] = byteRange;
      const segmentLocalId = Segment.getSegmentLocalId(url, { start, end });
      staleSegmentIds.delete(segmentLocalId);

      if (playlist.segments.has(segmentLocalId)) return;
      const segment = new Segment({
        segmentUrl: url,
        index: live ? sn : index,
        ...(start && end ? { byteRange: { start, end } } : {}),
        type: playlist.type,
        startTime: fragment.start,
        endTime: fragment.end,
      });
      playlist.segments.set(segment.localId, segment);
    });

    staleSegmentIds.forEach((id) => {
      const segment = playlist.segments.get(id);
      if (!segment) return;
      playlist.segments.delete(id);
      if (playlist.type === "audio") {
        this.audioPlayback.removeStaleSegment(segment);
      }
    });
  }

  setPlayhead(position: number, frag?: Fragment) {
    if (frag) {
      const [start, end] = frag.byteRange;
      const segmentId = Segment.getSegmentLocalId(frag.url, { start, end });
      this.videoPlayback.playheadSegment = this.getSegmentById(segmentId);
    }
    this.videoPlayback.playheadTime = position;
    this.audioPlayback.setPlayheadTime(position);
  }

  addLoadedSegment(segment: Segment) {
    if (segment.type === "audio") {
      this.audioPlayback.addLoadedSegment(segment);
    }
  }

  destroy() {
    this.playlists.clear();
  }
}
