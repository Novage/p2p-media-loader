type BasePeerCommand<T extends PeerCommandType = PeerCommandType> = {
  c: T;
};

export enum PeerCommandType {
  SegmentsAnnouncement,
  SegmentRequest,
  SegmentData,
  SegmentDataSendingCompleted,
  SegmentAbsent,
  CancelSegmentRequest,
}

export type PeerSegmentCommand = BasePeerCommand<
  | PeerCommandType.SegmentAbsent
  | PeerCommandType.CancelSegmentRequest
  | PeerCommandType.SegmentDataSendingCompleted
> & {
  i: number; // segment id
};

export type PeerRequestSegmentCommand =
  BasePeerCommand<PeerCommandType.SegmentRequest> & {
    i: number; // segment id
    b?: number; // byte from
  };

export type PeerSegmentAnnouncementCommand =
  BasePeerCommand<PeerCommandType.SegmentsAnnouncement> & {
    l?: number[]; // loaded segments
    p?: number[]; // segments loading by http
  };

export type PeerSendSegmentCommand =
  BasePeerCommand<PeerCommandType.SegmentData> & {
    i: number; // segment id
    s: number; // size in bytes
  };

export type PeerCommand =
  | PeerSegmentCommand
  | PeerRequestSegmentCommand
  | PeerSegmentAnnouncementCommand
  | PeerSendSegmentCommand;
