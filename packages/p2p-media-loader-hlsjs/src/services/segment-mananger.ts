import { Stream, Segment } from "./playlist";
import type {
  ManifestLoadedData,
  LevelUpdatedData,
  AudioTrackLoadedData,
} from "hls.js";
import { Core, StreamsContainer } from "p2p-media-loader-core";

export class SegmentManager {
  container: StreamsContainer<Segment, Stream>;

  constructor(core: Core<Segment, Stream>) {
    this.container = core.container;
  }

  processMasterManifest(data: ManifestLoadedData) {
    const { levels, audioTracks, url } = data;
    levels.forEach((level, index) =>
      this.container.addPlaylist(
        level.url,
        new Stream({
          type: "video",
          index,
          masterManifestUrl: url,
        })
      )
    );

    audioTracks.forEach((track, index) =>
      this.container.addPlaylist(
        track.url,
        new Stream({
          type: "audio",
          index,
          masterManifestUrl: url,
        })
      )
    );
  }

  updatePlaylist(data: LevelUpdatedData | AudioTrackLoadedData) {
    if (!data.details) return;
    const {
      details: { url, fragments, live },
    } = data;

    const playlist = this.container.getPlaylist(url);
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
      playlist.segments.set(segment.id, segment);
    });

    segmentToRemoveIds.forEach((value) => playlist.segments.delete(value));
  }
}
