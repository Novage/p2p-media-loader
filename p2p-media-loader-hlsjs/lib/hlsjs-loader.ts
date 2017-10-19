import SegmentManager from "./segment-manager";

const DEFAULT_DOWNLOAD_LATENCY = 20;
const DEFAULT_DOWNLOAD_TIME = 1000;
const DEFAULT_PLAYLIST_DOWNLOAD_TIME = 500;

export default class HlsJsLoader {

    private segmentManager: SegmentManager;
    private context: any;
    private callbacks: any;
    private url: string;

    public constructor(segmentManager: SegmentManager, settings: any) {
        this.segmentManager = segmentManager;
    }

    public load(context: any, config_unused: any, callbacks: any): void {
        this.context = context;
        this.callbacks = callbacks;
        this.url = context.url;
        if (context.type) {
            this.segmentManager.loadPlaylist(this.url, context.type)
                .then((content: string) => { this.successPlaylist(content); })
                .catch((error: any) => { this.error(error); });
        } else if (context.frag) {
            this.segmentManager.loadSegment(this.url,
                (content: ArrayBuffer, downloadSpeed: number) => { setTimeout(() => { this.successSegment(content, downloadSpeed); }, 0); },
                (error: any) => { setTimeout(() => { this.error(error); }, 0); }
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
        // todo: report correct loading stats when they will be reported by the manager
        const now = performance.now();

        this.callbacks.onSuccess({
            url: this.url,
            data: content
        }, {
            trequest: now - DEFAULT_DOWNLOAD_LATENCY - DEFAULT_PLAYLIST_DOWNLOAD_TIME,
            tfirst: now - DEFAULT_PLAYLIST_DOWNLOAD_TIME,
            tload: now,
            loaded: content.length
        }, this.context);
    }

    private successSegment(content: ArrayBuffer, downloadSpeed: number): void {
        const now = performance.now();
        const downloadTime = (downloadSpeed <= 0) ? DEFAULT_DOWNLOAD_TIME : (content.byteLength / downloadSpeed);

        this.callbacks.onSuccess({
            url: this.url,
            data: content
        }, {
            trequest: now - DEFAULT_DOWNLOAD_LATENCY - downloadTime,
            tfirst: now - downloadTime,
            tload: now,
            loaded: content.byteLength
        }, this.context);
    }

    private error(error: any): void {
        this.callbacks.onError(error, this.context);
    }

}
