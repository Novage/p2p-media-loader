export class Segment {
    public constructor(
            readonly id: string,
            readonly url: string,
            readonly priority = 0,
            readonly data: ArrayBuffer | undefined = undefined,
            readonly downloadSpeed = 0) {
    }
}

export enum LoaderEvents {
    SegmentLoaded = "segment_loaded",
    SegmentError = "segment_error",
    SegmentAbort = "segment_abort",
    PeerConnect = "peer_connect",
    PeerClose = "peer_close",
    PieceBytesDownloaded = "piece_bytes_downloaded",
    PieceBytesUploaded = "piece_bytes_uploaded"
}

export interface LoaderInterface {

    on(eventName: string | symbol, listener: Function): this;
    load(segments: Segment[], swarmId: string, emitNowSegmentUrl?: string): void;
    getSettings(): any;
    destroy(): void;
    isSupported(): boolean;

}
