import SegmentManager from "./segment-manager";

export default class HlsJsLoader {

    private segmentManager: SegmentManager;
    private stats: any;
    private context: any;
    private callbacks: any;
    private url: string;

    public constructor(segmentManager: SegmentManager, settings_unused: any) {
        this.segmentManager = segmentManager;
        this.stats = {};
    }

    public load(context: any, config_unused: any, callbacks: any): void {
        this.context = context;
        this.callbacks = callbacks;
        this.url = context.url;
        if (context.type === "manifest" || context.type === "level") {
            this.segmentManager.loadPlaylist(this.url)
                .then((content: any) => { this.success(content); })
                .catch((error: any) => { this.error(error); });
        } else if (context.frag) {
            this.segmentManager.loadSegment(this.url,
                (content: any) => { setTimeout(() => { this.success(content); }, 0); },
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

    private success(content: any): void {
        // todo: report correct loading stats when they will be reported by the manager
        this.stats.trequest = performance.now();
        this.stats.tfirst = this.stats.trequest + 500;
        this.stats.tload = this.stats.trequest + 500;
        this.stats.loaded = content instanceof ArrayBuffer
            ? content.byteLength
            : content.length;

        this.callbacks.onSuccess({
            url: this.url,
            data: content
        }, this.stats, this.context);
    }

    private error(error: any): void {
        this.callbacks.onError(error, this.context);
    }

}
