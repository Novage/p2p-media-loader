export class Segment {

    public url: string;
    public priority: number;
    public data: ArrayBuffer | undefined;
    public downloadSpeed: number; // in bytes/ms

    public constructor(url: string, priority: number = 0, data: ArrayBuffer | undefined = undefined, downloadSpeed: number = 0) {
        this.url = url;
        this.priority = priority;
        this.data = data;
        this.downloadSpeed = downloadSpeed;
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
