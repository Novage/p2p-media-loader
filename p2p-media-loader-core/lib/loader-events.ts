enum LoaderEvents {
    SegmentLoaded = "segment_loaded",
    SegmentError = "segment_error",
    SegmentAbort = "segment_abort",
    ForceProcessing = "force_processing",
    PeerConnect = "peer_connect",
    PeerClose = "peer_close",
    PieceBytesLoaded = "piece_bytes_loaded"
}

export default LoaderEvents;
