import P2PMediaLoader from "./p2p-media-loader";

export default class HlsJsLoader {

    private p2pml: P2PMediaLoader;
    private aborted: boolean;
    private stats: any;
    private context: any;
    private callbacks: any;

    public constructor(p2pml: P2PMediaLoader, settings_unused: any) {
        this.p2pml = p2pml;
    }

    public load(context: any, config_unused: any, callbacks: any) {
        this.aborted = false;
        this.context = context;
        this.callbacks = callbacks;
        this.stats = { trequest: performance.now() };
        if (context.type === "manifest" || context.type === "level") {
            this.p2pml.loadHlsPlaylist(context.url)
                .then((content: any) => { this.success(content); })
                .catch((error: any) => { this.error(error); });
        } else if (context.frag) {
            this.p2pml.loadChunk(context.url)
                .then((content: any) => { this.success(content); })
                .catch((error: any) => { this.error(error); });
        } else {
            console.warn("Unknown load request", context);
        }
    }

    public abort() {
        this.aborted = true;
    }

    public destroy() {
        this.abort();
    }

    private success(content: any) {
        if (this.aborted) {
            return;
        }

        this.stats.tfirst = performance.now();
        this.stats.tload = performance.now();
        this.stats.loaded = content.length;

        this.callbacks.onSuccess({
            url: this.context.url,
            data: content
        }, this.stats, this.context);
    }

    private error(error: any) {
        if (this.aborted) {
            return;
        }

        this.callbacks.onError(error, this.context);
    }

}
