export class Segment {
    public constructor(
        readonly id: string,
        readonly url: string,
        readonly range: string | undefined,
        readonly priority = 0,
        readonly data: ArrayBuffer | undefined = undefined,
        readonly downloadSpeed = 0
    ) {}
}

export enum Events {
    /**
     * Emitted when segment has been downloaded.
     * Args: segment
     */
    SegmentLoaded = "segment_loaded",

    /**
     * Emitted when an error occurred while loading the segment.
     * Args: segment, error
     */
    SegmentError = "segment_error",

    /**
     * Emitted for each segment that does not hit into a new segments queue when the load() method is called.
     * Args: segment
     */
    SegmentAbort = "segment_abort",

    /**
     * Emitted when a peer is connected.
     * Args: peer
     */
    PeerConnect = "peer_connect",

    /**
     * Emitted when a peer is disconnected.
     * Args: peerId
     */
    PeerClose = "peer_close",

    /**
     * Emitted when a segment piece has been downloaded.
     * Args: method (can be "http" or "p2p" only), bytes
     */
    PieceBytesDownloaded = "piece_bytes_downloaded",

    /**
     * Emitted when a segment piece has been uploaded.
     * Args: method (can be "p2p" only), bytes
     */
    PieceBytesUploaded = "piece_bytes_uploaded"
}

export interface LoaderInterface {
    on(eventName: string | symbol, listener: Function): this;
    load(segments: Segment[], swarmId: string): void;
    getSegment(id: string): Segment | undefined;
    getSettings(): any;
    destroy(): void;
}
