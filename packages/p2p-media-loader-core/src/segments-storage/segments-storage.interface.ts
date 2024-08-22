import { CommonCoreConfig, StreamConfig } from "../types.js";

export interface ISegmentsStorage {
  initialize(
    storageConfig: CommonCoreConfig,
    mainStreamConfig: StreamConfig,
    secondaryStreamConfig: StreamConfig,
  ): Promise<void>;

  isInitialized(): boolean;

  setSegmentPlaybackCallback(getCurrentPlaybackTime: () => number): void;

  setEngineRequestSegmentDurationCallback(
    getSegmentDurationFromEngineRequest: () => {
      startTime: number;
      endTime: number;
    },
  ): void;

  storeSegment(
    streamId: string,
    segmentId: number,
    data: ArrayBuffer,
    startTime: number,
    endTime: number,
    streamType: string,
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

  destroy(): void;
}
