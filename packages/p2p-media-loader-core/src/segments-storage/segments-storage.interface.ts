export interface ISegmentsStorage {
  initialize(): Promise<void>;

  isInitialized(): boolean;

  addIsSegmentLockedPredicate(
    predicate: (streamId: string, segmentId: number) => boolean,
  ): void;

  storeSegment(
    streamId: string,
    segmentId: number,
    segmentData: ArrayBuffer,
    isLiveStream: boolean,
  ): Promise<void>;

  getSegmentData(
    streamId: string,
    segmentId: number,
  ): Promise<ArrayBuffer | undefined>;

  hasSegment(streamId: string, segmentId: number): boolean;

  getStoredSegmentExternalIdsOfStream(streamId: string): number[];

  subscribeOnUpdate(streamId: string, listener: () => void): void;

  unsubscribeFromUpdate(streamId: string, listener: () => void): void;

  destroy(): Promise<void>;
}
