import ChunkManager from "./chunk-manager";
import ChunkManagerInterface from "./chunk-manager-interface";
//import HttpLoader from "./http-loader";
import HlsJsLoader from "./hlsjs-loader";
import HybridLoader from "./hybrid-loader";
import HttpMediaManager from "./http-media-manager";
import LoaderFileCacheManager from "./loader-file-cache-manager";
import P2PMediaManager from "./p2p-media-manager";
const getHlsJsLoaderMaker = require("./hlsjs-loader-maker");

export default class P2PMediaLoader {

    private chunkManager: ChunkManagerInterface;

    public constructor();

    public constructor(chunkManager?: ChunkManagerInterface) {
        if (chunkManager) {
            this.chunkManager = chunkManager;
        } else {
            const httpManager = new HttpMediaManager();
            const cacheManager = new LoaderFileCacheManager();
            const p2pManager = new P2PMediaManager(cacheManager);
            //const loader = new HttpLoader(httpManager, cacheManager);
            const loader = new HybridLoader(httpManager, p2pManager, cacheManager);
            this.chunkManager = new ChunkManager(loader);
        }
    }

    public getHlsJsLoader(): any {
        return getHlsJsLoaderMaker(HlsJsLoader, this);
    }

    public setCurrentChunk(url: string): void {
        this.chunkManager.setCurrentChunk(url);
    }

    public async loadHlsPlaylist(url: string): Promise<string> {
        return this.chunkManager.loadHlsPlaylist(url);
    }

    public loadChunk(url: string, onSuccess?: Function, onError?: Function): void {
        this.chunkManager.loadChunk(url, onSuccess, onError);
    }

    public abortChunk(url: string): void {
        this.chunkManager.abortChunk(url);
    }

    public processHlsPlaylist(url: string, content: string): void {
        this.chunkManager.processHlsPlaylist(url, content);
    }

}
