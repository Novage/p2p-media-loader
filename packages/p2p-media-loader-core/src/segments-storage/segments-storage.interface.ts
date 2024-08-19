import { SegmentDataItem, SegmentInfoItem } from "./segments-types.js";

export interface ISegmentsStorage {
  readonly isInitialized: boolean;

  initialize(): Promise<void>;

  addIsSegmentLockedPredicate(
    predicate: (segment: SegmentInfoItem) => boolean,
  ): void;

  storeSegment(
    segmentInfoItem: SegmentInfoItem,
    segmentDataItem: SegmentDataItem,
    isLiveStream: boolean,
  ): Promise<void>;

  getSegmentData(segmentStorageId: string): Promise<ArrayBuffer | undefined>;

  hasSegment(segmentStorageId: string): boolean;

  getStoredSegmentExternalIdsOfStream(streamSwarmId: string): number[];

  subscribeOnUpdate(streamId: string, listener: () => void): void;

  unsubscribeFromUpdate(streamId: string, listener: () => void): void;

  destroy(): Promise<void>;
}
