import { Segment } from "./types";
import { SegmentPlaybackStatuses } from "./utils/stream";

export type Playback = {
  position: number;
  rate: number;
};

export type QueueItem = { segment: Segment; statuses: SegmentPlaybackStatuses };
