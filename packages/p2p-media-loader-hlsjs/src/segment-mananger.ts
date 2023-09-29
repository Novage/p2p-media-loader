import * as Utils from "./utils";
import type {
  ManifestLoadedData,
  LevelUpdatedData,
  AudioTrackLoadedData,
} from "hls.js";
import { Core, SegmentBase } from "p2p-media-loader-core";

export class SegmentManager {
  core: Core;

  constructor(core: Core) {
    this.core = core;
  }

  processMasterManifest(data: ManifestLoadedData) {
    const { levels, audioTracks } = data;
    // in the case of audio only stream it is stored in levels
    levels.forEach((level, index) =>
      this.core.addStreamIfNoneExists({
        localId: level.url,
        type: "main",
        index,
      })
    );

    audioTracks.forEach((track, index) =>
      this.core.addStreamIfNoneExists({
        localId: track.url,
        type: "secondary",
        index,
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
    const newSegments: SegmentBase[] = [];
    fragments.forEach((fragment, index) => {
      const {
        url: responseUrl,
        byteRange: fragByteRange,
        sn,
        start: startTime,
        end: endTime,
      } = fragment;
      if (sn === "initSegment") return;

      const [start, end] = fragByteRange;
      const byteRange = Utils.getByteRange(
        start,
        end !== undefined ? end - 1 : undefined
      );
      const segmentLocalId = Utils.getSegmentLocalId(responseUrl, byteRange);
      segmentToRemoveIds.delete(segmentLocalId);

      if (playlist.segments.has(segmentLocalId)) return;
      newSegments.push({
        localId: segmentLocalId,
        url: responseUrl,
        externalId: live ? sn.toString() : index.toString(),
        byteRange,
        startTime,
        endTime,
      });
    });

    this.core.updateStream(url, newSegments, [...segmentToRemoveIds]);
  }
}
