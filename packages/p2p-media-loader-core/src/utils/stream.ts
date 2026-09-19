import { StreamConfig } from "../types.js";
import {
  Playback,
  SegmentWithStream,
  StreamWithSegments,
} from "../internal-types.js";
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

/**
 * Seconds from the playhead to a segment's edges, positive ahead.
 *
 * The buffer edge sits exactly `bufferAhead` in front of the playhead, so
 * subtracting it converts manifest time into distance from the playhead. Both
 * terms are differences — a manifest-space delta and a player-space duration —
 * so the offset between the two timelines cancels and never has to be known.
 */
export function getDistanceFromPlayhead(
  segment: Pick<SegmentWithStream, "startTime" | "endTime">,
  playback: Pick<Playback, "bufferEdge" | "bufferAhead">,
): { start: number; end: number } {
  const { bufferEdge, bufferAhead } = playback;
  return {
    start: segment.startTime - bufferEdge + bufferAhead,
    end: segment.endTime - bufferEdge + bufferAhead,
  };
}

export function isSegmentInTimeWindow(
  segment: Pick<SegmentWithStream, "startTime" | "endTime">,
  playback: Pick<Playback, "bufferEdge" | "bufferAhead" | "rate">,
  timeWindowLength: number,
): boolean {
  const { start, end } = getDistanceFromPlayhead(segment, playback);
  const rightMargin = timeWindowLength * playback.rate;
  return !(rightMargin < start || 0 > end);
}
