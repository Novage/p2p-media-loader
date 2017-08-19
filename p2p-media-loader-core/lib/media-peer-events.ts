enum MediaPeerEvents {
    Connect = "peer_connect",
    Close = "peer_close",
    Error = "peer_error",
    DataSegmentsMap = "peer_data_segments_map",
    DataSegmentRequest = "peer_data_segment_request",
    DataSegmentLoaded = "peer_data_segment_loaded",
    DataSegmentAbsent = "peer_data_segment_absent"
}

export default MediaPeerEvents;
