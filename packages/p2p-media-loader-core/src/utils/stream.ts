import {
  SegmentWithStream,
  Stream,
  StreamConfig,
  StreamWithSegments,
} from "../types.js";
import { Playback } from "../internal-types.js";
import { P2PLoader } from "../p2p/loader.js";

export type SegmentPlaybackStatuses = {
  isHighDemand: boolean;
  isHttpDownloadable: boolean;
  isP2PDownloadable: boolean;
};

export type PlaybackTimeWindowsConfig = Pick<
  StreamConfig,
  "highDemandTimeWindow" | "httpDownloadTimeWindow" | "p2pDownloadTimeWindow"
>;

const PEER_PROTOCOL_VERSION = "v2";

/**
 * Generates a short, stable alphanumeric ID for a stream based on its properties.
 * Uses a djb2/Java-style string hash algorithm (hash * 31 + charCode) and encodes
 * the resulting 32-bit integer into a Base36 string for compactness.
 */
export function generateStreamShortId({
  bitrate,
  codecs,
  width,
  height,
  language,
  channels,
}: {
  bitrate?: number | null;
  codecs?: string | null;
  width?: number | null;
  height?: number | null;
  language?: string | null;
  channels?: string | number | null;
}): string {
  const normalizedCodecs = codecs
    ? codecs
        .split(",")
        .map((c) => {
          c = c.trim().toLowerCase();
          // Normalize decimal RFC 4281 avc1 codecs to hex (e.g., avc1.66.30 -> avc1.42001e)
          const parts = c.split(".");
          if (
            parts.length === 3 &&
            (parts[0] === "avc1" || parts[0] === "avc")
          ) {
            const profile = parseInt(parts[1], 10);
            const level = parseInt(parts[2], 10);
            if (
              !isNaN(profile) &&
              !isNaN(level) &&
              parts[1] === profile.toString() &&
              parts[2] === level.toString()
            ) {
              const profileHex = profile.toString(16).padStart(2, "0");
              const levelHex = level.toString(16).padStart(2, "0");
              c = `${parts[0]}.${profileHex}00${levelHex}`;
            }
          }
          return c;
        })
        .sort()
        .join(",")
    : "";
  const normalizedLanguage =
    language && language !== "und" ? language.slice(0, 2).toLowerCase() : "";
  const normalizedChannels = channels ? channels.toString().split("/")[0] : "";

  const str = `${bitrate ?? 0}-${normalizedCodecs}-${width ?? ""}-${height ?? ""}-${normalizedLanguage}-${normalizedChannels}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function getStreamSwarmId(
  swarmId: string,
  stream: Readonly<Stream>,
): string {
  return `${PEER_PROTOCOL_VERSION}-${swarmId}-${getStreamId(stream)}`;
}

export function getSegmentFromStreamsMap(
  streams: Map<string, StreamWithSegments>,
  segmentRuntimeId: string,
): SegmentWithStream | undefined {
  for (const stream of streams.values()) {
    const segment = stream.segments.get(segmentRuntimeId);
    if (segment) return segment;
  }
}

export function getSegmentFromStreamByExternalId(
  stream: StreamWithSegments,
  segmentExternalId: number,
): SegmentWithStream | undefined {
  for (const segment of stream.segments.values()) {
    if (segment.externalId === segmentExternalId) return segment;
  }
}

export function getStreamId(stream: Stream) {
  return `${stream.type}-${stream.index}`;
}

export function getSegmentAvgDuration(stream: StreamWithSegments) {
  const { segments } = stream;
  let sumDuration = 0;
  const { size } = segments;
  for (const segment of segments.values()) {
    const duration = segment.endTime - segment.startTime;
    sumDuration += duration;
  }

  return sumDuration / size;
}

function calculateTimeWindows(
  timeWindowsConfig: PlaybackTimeWindowsConfig,
  availableMemoryInPercent: number,
) {
  const {
    highDemandTimeWindow,
    httpDownloadTimeWindow,
    p2pDownloadTimeWindow,
  } = timeWindowsConfig;

  const result = {
    highDemandTimeWindow,
    httpDownloadTimeWindow,
    p2pDownloadTimeWindow,
  };

  if (availableMemoryInPercent <= 5) {
    result.httpDownloadTimeWindow = 0;
    result.p2pDownloadTimeWindow = 0;
  } else if (availableMemoryInPercent <= 10) {
    result.p2pDownloadTimeWindow = result.httpDownloadTimeWindow;
  }

  return result;
}

export function getSegmentPlaybackStatuses(
  segment: SegmentWithStream,
  playback: Playback,
  timeWindowsConfig: PlaybackTimeWindowsConfig,
  currentP2PLoader: P2PLoader,
  availableMemoryPercent: number,
): SegmentPlaybackStatuses {
  const {
    highDemandTimeWindow,
    httpDownloadTimeWindow,
    p2pDownloadTimeWindow,
  } = calculateTimeWindows(timeWindowsConfig, availableMemoryPercent);

  return {
    isHighDemand: isSegmentInTimeWindow(
      segment,
      playback,
      highDemandTimeWindow,
    ),
    isHttpDownloadable: isSegmentInTimeWindow(
      segment,
      playback,
      httpDownloadTimeWindow,
    ),
    isP2PDownloadable:
      isSegmentInTimeWindow(segment, playback, p2pDownloadTimeWindow) &&
      currentP2PLoader.isSegmentLoadingOrLoadedBySomeone(segment),
  };
}

function isSegmentInTimeWindow(
  segment: SegmentWithStream,
  playback: Playback,
  timeWindowLength: number,
) {
  const { startTime, endTime } = segment;
  const { position, rate } = playback;
  const rightMargin = position + timeWindowLength * rate;
  return !(rightMargin < startTime || position > endTime);
}
