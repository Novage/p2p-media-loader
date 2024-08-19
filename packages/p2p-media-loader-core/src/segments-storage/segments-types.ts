export type SegmentInfoItem = {
  streamSwarmId: string;
  streamId: string;
  externalId: number;
  storageId: string;
};

export type SegmentDataItem = {
  storageId: string;
  data: ArrayBuffer;
  lastAccessed: number;
  streamId: string;
  externalId: number;
  streamSwarmId: string;
};
