import { Segment } from "./types";

export type Playback = {
  position: number;
  rate: number;
};

export type SegmentLoadStatus =
  | "high-demand"
  | "http-downloadable"
  | "p2p-downloadable";

export type NumberRange = {
  from: number;
  to: number;
};

export type LoadBufferRanges = {
  highDemand: NumberRange;
  http: NumberRange;
  p2p: NumberRange;
};

export type QueueItem = { segment: Segment; statuses: Set<SegmentLoadStatus> };
