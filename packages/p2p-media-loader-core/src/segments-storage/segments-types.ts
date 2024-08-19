export type SegmentInfoItem = {
  streamSwarmId: string;
  streamId: string;
  externalId: number;
};

export type SegmentDataItem = {
  storageId: string;
  data: ArrayBuffer;
  lastAccessed: number;
  streamId: string;
  externalId: number;
  streamSwarmId: string;
};
