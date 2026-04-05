import * as Utils from "./utils.js";
import type {
  ManifestLoadedData,
  LevelUpdatedData,
  AudioTrackLoadedData,
  LevelParsed,
} from "hls.js";
import { Core, Segment, generateStreamShortId } from "p2p-media-loader-core";

export class SegmentManager {
  core: Core;

  constructor(core: Core) {
    this.core = core;
  }

  processMainManifest(data: ManifestLoadedData) {
    const { levels, audioTracks } = data;
    // in the case of audio only stream it is stored in levels

    for (const level of levels) {
      const { url, bitrate, maxBitrate, videoCodec, width, height } =
        level as LevelParsed & { maxBitrate?: number };
      // maxBitrate tracks the peak BANDWIDTH tag, whereas bitrate tracks AVERAGE-BANDWIDTH.
      // We prioritize maxBitrate to universally match Shaka's variant.bandwidth parsing.
      const b = maxBitrate || bitrate;
      const isMissingMetadata = b === 0;
      const frameRate = level.attrs?.["FRAME-RATE"];
      const videoRange = level.attrs?.["VIDEO-RANGE"];

      const index = generateStreamShortId({
        bitrate: b,
        codecs: isMissingMetadata ? undefined : videoCodec,
        width: isMissingMetadata ? undefined : width,
        height: isMissingMetadata ? undefined : height,
        frameRate: isMissingMetadata ? undefined : frameRate,
        videoRange: isMissingMetadata ? undefined : videoRange,
      });
      this.core.addStreamIfNoneExists({
        runtimeId: Array.isArray(url) ? (url as string[])[0] : url,
        type: "main",
        index,
      });
      console.log(
        ">>> HLS v",
        b,
        isMissingMetadata ? undefined : videoCodec,
        isMissingMetadata ? undefined : width,
        isMissingMetadata ? undefined : height,
        isMissingMetadata ? undefined : frameRate,
        isMissingMetadata ? undefined : videoRange,
        index,
      );
    }

    for (const track of audioTracks) {
      // Object properties vary across hls.js versions so we cast to any:
      const { url, audioCodec, lang, channels, name } = track;
      const index = generateStreamShortId({
        bitrate: 0, // Match Shaka behavior for audio stream without variant
        codecs: audioCodec,
        language: lang,
        channels,
        name,
      });
      this.core.addStreamIfNoneExists({
        runtimeId: Array.isArray(url) ? (url as string[])[0] : url,
        type: "secondary",
        index,
      });

      console.log(">>> HLS a", 0, audioCodec, lang, channels, index);
    }
  }

  updatePlaylist(data: LevelUpdatedData | AudioTrackLoadedData) {
    const {
      details: { url, fragments, live },
    } = data;

    const playlist = this.core.getStream(url);
    if (!playlist) return;

    const segmentToRemoveIds = new Set(playlist.segments.keys());
    const newSegments: Segment[] = [];
    fragments.forEach((fragment, index) => {
      const {
        url: responseUrl,
        byteRange: fragByteRange,
        sn,
        start: startTime,
        end: endTime,
      } = fragment;

      const [start, end] = fragByteRange;
      const byteRange = Utils.getByteRange(
        start,
        end !== undefined ? end - 1 : undefined,
      );
      const runtimeId = Utils.getSegmentRuntimeId(responseUrl, byteRange);
      segmentToRemoveIds.delete(runtimeId);

      if (playlist.segments.has(runtimeId)) return;
      newSegments.push({
        runtimeId,
        url: responseUrl,
        externalId: live ? sn : index,
        byteRange,
        startTime,
        endTime,
      });
    });

    if (!newSegments.length && !segmentToRemoveIds.size) return;
    this.core.updateStream(url, newSegments, segmentToRemoveIds.values());
  }
}
