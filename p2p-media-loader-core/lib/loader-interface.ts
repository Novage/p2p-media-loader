import Segment from "./segment";

export enum LoaderEvents {
    SegmentLoaded = "segment_loaded",
    SegmentError = "segment_error",
    SegmentAbort = "segment_abort",
    PeerConnect = "peer_connect",
    PeerClose = "peer_close",
    PieceBytesLoaded = "piece_bytes_loaded"
}

export interface LoaderInterface {

    on(eventName: string | symbol, listener: Function): this;
    load(segments: Segment[], swarmId: string, emitNowSegmentUrl?: string): void;
    getSettings(): any;
    destroy(): void;

}
