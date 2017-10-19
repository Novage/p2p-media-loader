import SegmentManager from "./segment-manager";

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
                .then((content: string) => { this.success(content); })
                .catch((error: any) => { this.error(error); });
        } else if (context.frag) {
            this.segmentManager.loadSegment(this.url,
                (content: ArrayBuffer) => { setTimeout(() => { this.success(content); }, 0); },
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

    private success(content: string | ArrayBuffer): void {
        // todo: report correct loading stats when they will be reported by the manager
        const now = performance.now();

        this.callbacks.onSuccess({
            url: this.url,
            data: content
        }, {
            trequest: now,
            tfirst: now + 500,
            tload: now + 500,
            loaded: content instanceof ArrayBuffer ? content.byteLength : content.length
        }, this.context);
    }

    private error(error: any): void {
        this.callbacks.onError(error, this.context);
    }

}
