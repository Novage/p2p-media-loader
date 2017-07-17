import P2PMediaLoader from "./p2p-media-loader";

export default class HlsJsLoader {

    private p2pml: P2PMediaLoader;
    private stats: any;
    private context: any;
    private callbacks: any;
    private url: string;

    public constructor(p2pml: P2PMediaLoader, settings_unused: any) {
        this.p2pml = p2pml;
        this.stats = {};
    }

    public load(context: any, config_unused: any, callbacks: any): void {
        this.context = context;
        this.callbacks = callbacks;
        this.url = context.url;
        this.stats.trequest = performance.now();
        if (context.type === "manifest" || context.type === "level") {
            this.p2pml.loadHlsPlaylist(this.url)
                .then((content: any) => { this.success(content); })
                .catch((error: any) => { this.error(error); });
        } else if (context.frag) {
            this.p2pml.loadChunk(this.url,
                (content: any) => { setTimeout(() => { this.success(content); }, 0); },
                (error: any) => { setTimeout(() => { this.error(error); }, 0); }
            );
        } else {
            console.warn("Unknown load request", context);
        }
    }

    public abort(): void {
        this.p2pml.abortChunk(this.url);
    }

    public destroy(): void {
        this.abort();
    }

    private success(content: any): void {
        this.stats.tfirst = performance.now();
        this.stats.tload = performance.now();
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
