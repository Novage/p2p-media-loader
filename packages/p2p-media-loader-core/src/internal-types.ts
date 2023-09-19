import { Segment } from "./types";
import { PeerCommandType } from "./enums";

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

export type BasePeerCommand<T extends PeerCommandType = PeerCommandType> = {
  c: T;
};

// {[streamId]: [segmentIds[]; segmentStatuses[]]}
export type JsonSegmentAnnouncementMap = {
  [key: string]: [number[], number[]];
};

export type PeerSegmentCommand = BasePeerCommand<
  | PeerCommandType.SegmentRequest
  | PeerCommandType.SegmentAbsent
  | PeerCommandType.CancelSegmentRequest
> & {
  i: string;
};

export type PeerSegmentAnnouncementCommand =
  BasePeerCommand<PeerCommandType.SegmentsAnnouncement> & {
    m: JsonSegmentAnnouncementMap;
  };

export type PeerSendSegmentCommand =
  BasePeerCommand<PeerCommandType.SegmentData> & {
    i: string;
    s: number;
  };

export type PeerCommand =
  | PeerSegmentCommand
  | PeerSegmentAnnouncementCommand
  | PeerSendSegmentCommand;
