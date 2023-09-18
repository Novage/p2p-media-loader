export enum PeerCommandType {
  SegmentsAnnouncement,
  SegmentRequest,
  SegmentData,
  SegmentAbsent,
}

export enum PeerSegmentStatus {
  Loaded,
  LoadingByHttp,
}
