import * as Utils from "./utils";
import type {
  ManifestLoadedData,
  LevelUpdatedData,
  AudioTrackLoadedData,
} from "hls.js";
import { Core, Segment } from "p2p-media-loader-core";

export class SegmentManager {
  core: Core;

  constructor(core: Core) {
    this.core = core;
  }

  processMasterManifest(data: ManifestLoadedData) {
    const { levels, audioTracks, url } = data;
    levels.forEach((level, index) =>
      this.core.addStream({
        localId: level.url,
        type: "video",
        index,
        segments: new Map(),
      })
    );

    audioTracks.forEach((track, index) =>
      this.core.addStream({
        localId: track.url,
        type: "audio",
        index,
        segments: new Map(),
      })
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
      const { url: responseUrl, byteRange: fragByteRange, sn } = fragment;
      if (sn === "initSegment") return;

      const [start, end] = fragByteRange;
      const byteRange = Utils.getByteRange(
        start,
        end !== undefined ? end - 1 : undefined
      );
      const segmentLocalId = Utils.getSegmentLocalId(url, byteRange);
      segmentToRemoveIds.delete(segmentLocalId);

      if (playlist.segments.has(segmentLocalId)) return;
      newSegments.push({
        localId: segmentLocalId,
        url: responseUrl,
        globalId: live ? sn : index,
        byteRange,
      });
    });

    this.core.updateStream(url, newSegments, [...segmentToRemoveIds]);
  }
}
