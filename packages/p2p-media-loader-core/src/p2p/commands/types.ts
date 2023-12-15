type BasePeerCommand<T extends PeerCommandType = PeerCommandType> = {
  c: T;
};

export enum PeerCommandType {
  SegmentsAnnouncement,
  SegmentRequest,
  SegmentData,
  SegmentAbsent,
  CancelSegmentRequest,
}

export type PeerSegmentCommand = BasePeerCommand<
  | PeerCommandType.SegmentRequest
  | PeerCommandType.SegmentAbsent
  | PeerCommandType.CancelSegmentRequest
> & {
  i: number; // segment id
};

export type PeerSegmentAnnouncementCommand =
  BasePeerCommand<PeerCommandType.SegmentsAnnouncement> & {
    l: number[]; // loaded segments
    p: number[]; // segments loading by http
  };

export type PeerSendSegmentCommand =
  BasePeerCommand<PeerCommandType.SegmentData> & {
    i: number; // segment id
    s: number; // size in bytes
  };

export type PeerCommand =
  | PeerSegmentCommand
  | PeerSegmentAnnouncementCommand
  | PeerSendSegmentCommand;
