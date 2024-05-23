import {
  CoreConfig,
  SegmentWithStream,
  Stream,
  StreamWithSegments,
} from "../types";
import { Playback } from "../internal-types";
import { P2PLoader } from "../p2p/loader";

export type SegmentPlaybackStatuses = {
  isHighDemand?: boolean;
  isHttpDownloadable?: boolean;
  isP2PDownloadable?: boolean;
};

export type PlaybackTimeWindowsConfig = Pick<
  CoreConfig,
  "highDemandTimeWindow" | "httpDownloadTimeWindow" | "p2pDownloadTimeWindow"
>;

const PEER_PROTOCOL_VERSION = "V1";

export function getStreamExternalId(
  manifestResponseUrl: string,
  stream: Readonly<Stream>,
): string {
  const { type, index } = stream;
  return `${PEER_PROTOCOL_VERSION}:${manifestResponseUrl}-${type}-${index}`;
}

export function getSegmentFromStreamsMap(
  streams: Map<string, StreamWithSegments>,
  segmentId: string,
): SegmentWithStream | undefined {
  for (const stream of streams.values()) {
    const segment = stream.segments.get(segmentId);
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

export function getStreamShortId(stream: Stream) {
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

export function isSegmentActualInPlayback(
  segment: Readonly<SegmentWithStream>,
  playback: Playback,
  timeWindowsConfig: PlaybackTimeWindowsConfig,
): boolean {
  const {
    isHighDemand = false,
    isHttpDownloadable = false,
    isP2PDownloadable = false,
  } = getSegmentPlaybackStatuses(segment, playback, timeWindowsConfig);
  return isHighDemand || isHttpDownloadable || isP2PDownloadable;
}

export function getSegmentPlaybackStatuses(
  segment: SegmentWithStream,
  playback: Playback,
  timeWindowsConfig: PlaybackTimeWindowsConfig,
  currentP2PLoader?: P2PLoader,
): SegmentPlaybackStatuses {
  const {
    highDemandTimeWindow,
    httpDownloadTimeWindow,
    p2pDownloadTimeWindow,
  } = timeWindowsConfig;

  const statuses: SegmentPlaybackStatuses = {
    isHighDemand: false,
    isHttpDownloadable: false,
    isP2PDownloadable: false,
  };

  if (isSegmentInTimeWindow(segment, playback, highDemandTimeWindow)) {
    statuses.isHighDemand = true;
  }

  if (isSegmentInTimeWindow(segment, playback, httpDownloadTimeWindow)) {
    statuses.isHttpDownloadable = true;
  }

  if (isSegmentInTimeWindow(segment, playback, p2pDownloadTimeWindow)) {
    if (
      currentP2PLoader &&
      currentP2PLoader.isSegmentLoadingOrLoadedBySomeone(segment)
    ) {
      statuses.isP2PDownloadable = true;
    } else if (!currentP2PLoader) {
      statuses.isP2PDownloadable = true;
    }
  }

  return statuses;
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
