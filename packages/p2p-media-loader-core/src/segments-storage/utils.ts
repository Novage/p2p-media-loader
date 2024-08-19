import { SegmentDataItem, SegmentInfoItem } from "./segments-types.js";

export function getStorageItemId(streamSwarmId: string, externalId: number) {
  return `${streamSwarmId}|${externalId}`;
}

export function createSegmentInfoItem(
  streamSwarmId: string,
  streamId: string,
  externalId: number,
  storageId: string,
): SegmentInfoItem {
  return { streamSwarmId, streamId, externalId, storageId };
}

export function createSegmentDataItem(
  storageId: string,
  data: ArrayBuffer,
  lastAccessed: number,
  streamId: string,
  externalId: number,
  streamSwarmId: string,
): SegmentDataItem {
  return { storageId, data, lastAccessed, streamId, externalId, streamSwarmId };
}
