import { Segment } from "../internal-types";
import { Stream } from "../types";
import { SegmentPlaybackStatuses } from "./stream";

export function getStreamString(stream: Stream) {
  return `${stream.type}-${stream.index}`;
}

export function getSegmentString(segment: Segment) {
  const { externalId } = segment;
  return `(${getStreamString(segment.stream)} | ${externalId})`;
}

export function getSegmentPlaybackStatusesString(
  statuses: SegmentPlaybackStatuses,
): string {
  const { isHighDemand, isHttpDownloadable, isP2PDownloadable } = statuses;
  if (isHighDemand) return "high-demand";
  if (isHttpDownloadable && isP2PDownloadable) return "http-p2p-window";
  if (isHttpDownloadable) return "http-window";
  if (isP2PDownloadable) return "p2p-window";
  return "-";
}
