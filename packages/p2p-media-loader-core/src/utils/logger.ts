import { Segment, Stream } from "../types";
import { QueueItem, QueueItemStatuses } from "../internal-types";

export function getStreamString(stream: Stream) {
  return `${stream.type}-${stream.index}`;
}

export function getSegmentString(segment: Segment) {
  const { externalId } = segment;
  return `(${getStreamString(segment.stream)} | ${externalId})`;
}

export function getSegmentFullString(segment: Segment) {
  const { externalId } = segment;
  return `(${getStreamString(segment.stream)} | ${externalId})`;
}

export function getStatusesString(statuses: QueueItemStatuses): string {
  const { isHighDemand, isHttpDownloadable, isP2PDownloadable } = statuses;
  if (isHighDemand) return "high-demand";
  if (isHttpDownloadable && isP2PDownloadable) return "http-p2p-window";
  if (isHttpDownloadable) return "http-window";
  if (isP2PDownloadable) return "p2p-window";
  return "-";
}

export function getQueueItemString(item: QueueItem) {
  const { segment, statuses } = item;
  const statusString = getStatusesString(statuses);
  return `${segment.externalId} ${statusString}`;
}
