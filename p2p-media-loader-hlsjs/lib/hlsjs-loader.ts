import ChunkManager from "./chunk-manager";

export default class HlsJsLoader {

    private chunkManager: ChunkManager;
    private stats: any;
    private context: any;
    private callbacks: any;
    private url: string;

    public constructor(chunkManager: ChunkManager, settings_unused: any) {
        this.chunkManager = chunkManager;
        this.stats = {};
    }

    public load(context: any, config_unused: any, callbacks: any): void {
        this.context = context;
        this.callbacks = callbacks;
        this.url = context.url;
        if (context.type === "manifest" || context.type === "level") {
            this.chunkManager.loadHlsPlaylist(this.url)
                .then((content: any) => { this.success(content); })
                .catch((error: any) => { this.error(error); });
        } else if (context.frag) {
            this.chunkManager.loadChunk(this.url,
                (content: any) => { setTimeout(() => { this.success(content); }, 0); },
                (error: any) => { setTimeout(() => { this.error(error); }, 0); }
            );
        } else {
            console.warn("Unknown load request", context);
        }
    }

    public abort(): void {
        this.chunkManager.abortChunk(this.url);
    }

    public destroy(): void {
        this.abort();
    }

    private success(content: any): void {
        // todo: report correct loading stats when they will be reported by p2pml.loadChunk
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
