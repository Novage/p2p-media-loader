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
  const size = segments.size;
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
