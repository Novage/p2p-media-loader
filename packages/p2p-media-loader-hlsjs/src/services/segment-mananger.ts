import { Stream, Segment } from "./playlist";
import type {
  ManifestLoadedData,
  LevelUpdatedData,
  AudioTrackLoadedData,
} from "hls.js";
import { Core } from "p2p-media-loader-core";

export class SegmentManager {
  core: Core<Segment, Stream>;

  constructor(core: Core<Segment, Stream>) {
    this.core = core;
  }

  processMasterManifest(data: ManifestLoadedData) {
    const { levels, audioTracks, url } = data;
    levels.forEach((level, index) =>
      this.core.addStream(
        new Stream({
          localId: level.url,
          type: "video",
          index,
          masterManifestUrl: url,
        })
      )
    );

    audioTracks.forEach((track, index) =>
      this.core.addStream(
        new Stream({
          localId: track.url,
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

    const playlist = this.core.getStream(url);
    if (!playlist) return;

    const segmentToRemoveIds = new Set(playlist.segments.keys());
    const newSegments: Segment[] = [];
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
      newSegments.push(segment);
    });

    this.core.updateStream(url, newSegments, [...segmentToRemoveIds]);
  }
}
