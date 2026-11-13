import { StreamConfig } from "../types.js";
import {
  Playback,
  SegmentWithStream,
  StreamWithSegments,
} from "../internal-types.js";
import { P2PLoader } from "../p2p/loader.js";

export type SegmentPlaybackStatuses = {
  isHttpDownloadable: boolean;
  isP2PDownloadable: boolean;
};

/** The two windows a queue pass prefetches by, in seconds. */
export type PlaybackTimeWindowsConfig = Pick<
  StreamConfig,
  "httpDownloadTimeWindow" | "p2pDownloadTimeWindow"
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
  const { httpDownloadTimeWindow, p2pDownloadTimeWindow } = timeWindowsConfig;

  const result = { httpDownloadTimeWindow, p2pDownloadTimeWindow };

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
  const { httpDownloadTimeWindow, p2pDownloadTimeWindow } =
    calculateTimeWindows(timeWindowsConfig, availableMemoryPercent);

  return {
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
 * Whether a segment lies in a window that starts at the position — the start
 * of the segment the player requested last — and reaches `timeWindowLength`
 * seconds of media ahead at the playback rate. Both sides are manifest time.
 * See specs/playback-contract.md, "The time windows".
 */
export function isSegmentInTimeWindow(
  segment: Pick<SegmentWithStream, "startTime" | "endTime">,
  playback: Playback,
  timeWindowLength: number,
): boolean {
  const start = segment.startTime - playback.position;
  const end = segment.endTime - playback.position;
  const rightMargin = timeWindowLength * playback.rate;
  return !(rightMargin < start || 0 > end);
}
