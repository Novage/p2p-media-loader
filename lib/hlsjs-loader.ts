import P2PMediaLoader from "./p2p-media-loader";

export default class HlsJsLoader {

    private p2pml: P2PMediaLoader;
    private aborted: boolean;
    private stats: any;
    private context: any;
    private callbacks: any;
    private url: string;

    private onChunkLoadSuccessEvent = this.onChunkLoadSuccess.bind(this);
    private onChunkLoadErrorEvent = this.onChunkLoadError.bind(this);

    public constructor(p2pml: P2PMediaLoader, settings_unused: any) {
        this.p2pml = p2pml;
    }

    public load(context: any, config_unused: any, callbacks: any): void {
        this.aborted = false;
        this.context = context;
        this.callbacks = callbacks;
        this.url = context.url;
        this.stats = { trequest: performance.now() };
        if (context.type === "manifest" || context.type === "level") {
            this.p2pml.loadHlsPlaylist(this.url)
                .then((content: any) => { this.success(content); })
                .catch((error: any) => { this.error(error); });
        } else if (context.frag) {
            // todo: rework add/remove listeners to smth like this.p2pml.loadChunk(this.url, this.onChunkLoadSuccess, this.onChunkLoadError)
            this.p2pml.addListener("chunk_load_success", this.onChunkLoadSuccessEvent);
            this.p2pml.addListener("chunk_load_error", this.onChunkLoadErrorEvent);
            this.p2pml.loadChunk(this.url);
        } else {
            console.warn("Unknown load request", context);
        }
    }

    public abort(): void {
        this.aborted = true;
        this.p2pml.abortChunk(this.url);
        this.removeListeners();
    }

    public destroy(): void {
        this.abort();
    }

    private onChunkLoadSuccess(url: string, data: any): void {
        if (this.url === url) {
            this.success(data);
        }
    }

    private onChunkLoadError(url: string, error: any): void {
        if (this.url === url) {
            this.error(error);
        }
    }

    private success(content: any): void {
        if (this.aborted) {
            return;
        }

        this.removeListeners();

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
        if (this.aborted) {
            return;
        }

        this.removeListeners();
        this.callbacks.onError(error, this.context);
    }

    private removeListeners(): void {
        this.p2pml.removeListener("chunk_load_success", this.onChunkLoadSuccessEvent);
        this.p2pml.removeListener("chunk_load_error", this.onChunkLoadErrorEvent);
    }

}
