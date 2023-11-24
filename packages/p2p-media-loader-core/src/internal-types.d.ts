import { Segment } from "./types";

export type Playback = {
  position: number;
  rate: number;
};

export type NumberRange = {
  from: number;
  to: number;
};

export type LoadBufferRanges = {
  highDemand: NumberRange;
  http: NumberRange;
  p2p: NumberRange;
};

export type QueueItemStatuses = {
  isHighDemand: boolean;
  isHttpDownloadable: boolean;
  isP2PDownloadable: boolean;
};

export type QueueItem = { segment: Segment; statuses: QueueItemStatuses };
