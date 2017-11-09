import SegmentManager from "./segment-manager";

const DEFAULT_DOWNLOAD_LATENCY = 1;
const DEFAULT_DOWNLOAD_SPEED = 12500; // bytes per millisecond

export default class HlsJsLoader {

    private segmentManager: SegmentManager;
    private context: any;
    private callbacks: any;
    private url: string;

    private readonly stats: any = {}; // required for older versions of hls.js

    public constructor(segmentManager: SegmentManager, settings: any) {
        this.segmentManager = segmentManager;
    }

    public load(context: any, config_unused: any, callbacks: any): void {
        this.context = context;
        this.callbacks = callbacks;
        this.url = context.url;
        if (context.type) {
            this.segmentManager.loadPlaylist(this.url, context.type)
                .then((content: string) => this.successPlaylist(content))
                .catch((error: any) => this.error(error));
        } else if (context.frag) {
            this.segmentManager.loadSegment(this.url,
                (content: ArrayBuffer, downloadSpeed: number) => setTimeout(() => this.successSegment(content, downloadSpeed), 0),
                (error: any) => setTimeout(() => this.error(error), 0)
            );
        } else {
            console.warn("Unknown load request", context);
        }
    }

    public abort(): void {
        this.segmentManager.abortSegment(this.url);
    }

    public destroy(): void {
        this.abort();
    }

    private successPlaylist(content: string): void {
        const now = performance.now();

        this.stats.trequest = now - 300;
        this.stats.tfirst = now - 200;
        this.stats.tload = now;
        this.stats.loaded = content.length;

        this.callbacks.onSuccess({
            url: this.url,
            data: content
        }, this.stats, this.context);
    }

    private successSegment(content: ArrayBuffer, downloadSpeed: number): void {
        const now = performance.now();
        const downloadTime = content.byteLength / ((downloadSpeed <= 0) ? DEFAULT_DOWNLOAD_SPEED : downloadSpeed);

        this.stats.trequest = now - DEFAULT_DOWNLOAD_LATENCY - downloadTime;
        this.stats.tfirst = now - downloadTime;
        this.stats.tload = now;
        this.stats.loaded = content.byteLength;

        this.callbacks.onSuccess({
            url: this.url,
            data: content
        }, this.stats, this.context);
    }

    private error(error: any): void {
        this.callbacks.onError(error, this.context);
    }

}
