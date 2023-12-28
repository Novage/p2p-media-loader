import {
  Segment,
  Settings,
  Stream,
  StreamWithSegments,
  Playback,
} from "../types";

export type SegmentPlaybackStatuses = {
  isHighDemand: boolean;
  isHttpDownloadable: boolean;
  isP2PDownloadable: boolean;
};

export type PlaybackTimeWindowsSettings = Pick<
  Settings,
  "highDemandTimeWindow" | "httpDownloadTimeWindow" | "p2pDownloadTimeWindow"
>;

const PEER_PROTOCOL_VERSION = "V1";

export function getStreamExternalId(
  manifestResponseUrl: string,
  stream: Readonly<Stream>
): string {
  const { type, index } = stream;
  return `${PEER_PROTOCOL_VERSION}:${manifestResponseUrl}-${type}-${index}`;
}

export function getSegmentFromStreamsMap(
  streams: Map<string, StreamWithSegments>,
  segmentId: string
): Segment | undefined {
  for (const stream of streams.values()) {
    const segment = stream.segments.get(segmentId);
    if (segment) return segment;
  }
}

export function getSegmentFromStreamByExternalId(
  stream: StreamWithSegments,
  segmentExternalId: number
): Segment | undefined {
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
  segment: Readonly<Segment>,
  playback: Playback,
  timeWindowsSettings: PlaybackTimeWindowsSettings
) {
  const statuses = getSegmentPlaybackStatuses(
    segment,
    playback,
    timeWindowsSettings
  );
  return (
    statuses.isHighDemand ||
    statuses.isHttpDownloadable ||
    statuses.isP2PDownloadable
  );
}

export function getSegmentPlaybackStatuses(
  segment: Segment,
  playback: Playback,
  timeWindowsSettings: PlaybackTimeWindowsSettings
): SegmentPlaybackStatuses {
  const {
    highDemandTimeWindow,
    httpDownloadTimeWindow,
    p2pDownloadTimeWindow,
  } = timeWindowsSettings;

  return {
    isHighDemand: isSegmentInTimeWindow(
      segment,
      playback,
      highDemandTimeWindow
    ),
    isHttpDownloadable: isSegmentInTimeWindow(
      segment,
      playback,
      httpDownloadTimeWindow
    ),
    isP2PDownloadable: isSegmentInTimeWindow(
      segment,
      playback,
      p2pDownloadTimeWindow
    ),
  };
}

function isSegmentInTimeWindow(
  segment: Segment,
  playback: Playback,
  timeWindowLength: number
) {
  const { startTime, endTime } = segment;
  const { position, rate } = playback;
  const rightMargin = position + timeWindowLength * rate;
  return !(rightMargin < startTime || position > endTime);
}
