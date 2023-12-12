import { Segment } from "./types";
import { PeerCommandType } from "./enums";
import { SegmentPlaybackStatuses } from "./utils/stream";

export type Playback = {
  position: number;
  rate: number;
};

export type QueueItem = { segment: Segment; statuses: SegmentPlaybackStatuses };

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
