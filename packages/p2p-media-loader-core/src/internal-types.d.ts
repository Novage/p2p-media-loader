import { Segment } from "./types";
import { PeerCommandType } from "./enums";

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

export type BasePeerCommand<T extends PeerCommandType = PeerCommandType> = {
  c: T;
};

// {l: loadedSegmentsExternalIds; p: loadingInProcessSegmentExternalIds}
export type JsonSegmentAnnouncement = {
  l: string;
  p: string;
};

export type PeerSegmentCommand = BasePeerCommand<
  PeerCommandType.SegmentAbsent | PeerCommandType.CancelSegmentRequest
> & {
  i: string;
};

export type PeerSegmentRequestCommand =
  BasePeerCommand<PeerCommandType.SegmentRequest> & {
    i: string;
    // start byte of range
    b?: number;
  };

export type PeerSegmentAnnouncementCommand =
  BasePeerCommand<PeerCommandType.SegmentsAnnouncement> & {
    a: JsonSegmentAnnouncement;
  };

export type PeerSendSegmentCommand =
  BasePeerCommand<PeerCommandType.SegmentData> & {
    i: string;
    s: number;
  };

export type PeerCommand =
  | PeerSegmentCommand
  | PeerSegmentRequestCommand
  | PeerSegmentAnnouncementCommand
  | PeerSendSegmentCommand;
