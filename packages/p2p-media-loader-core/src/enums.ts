export enum PeerCommandType {
  SegmentsAnnouncement,
  SegmentRequest,
  SegmentData,
  SegmentAbsent,
  CancelSegmentRequest,
}

export enum PeerSegmentStatus {
  Loaded,
  LoadingByHttp,
}
