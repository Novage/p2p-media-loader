import ChunkManager from "./chunk-manager";
import HttpLoader from "./http-loader";
import HlsJsLoader from "./hlsjs-loader";
//import HybridLoader from "./hybrid-loader";
import HttpMediaManager from "./http-media-manager";
const getHlsJsLoaderMaker = require("./hlsjs-loader-maker");

export default class P2PMediaLoader {

    private chunkManager: ChunkManager;

    public constructor();

    public constructor(chunkManager?: ChunkManager) {
        if (chunkManager) {
            this.chunkManager = chunkManager;
        } else {
            const httpManager = new HttpMediaManager();
            //const p2pManager = new HttpMediaManager();
            const loader = new HttpLoader(httpManager);
            //const loader = new HybridLoader(httpManager, p2pManager);
            this.chunkManager = new ChunkManager(loader);
        }
    }

    public getHlsJsLoader() {
        return getHlsJsLoaderMaker(HlsJsLoader, this);
    }

    public async loadHlsPlaylist(url: string) {
        return this.chunkManager.loadHlsPlaylist(url);
    }

    public loadChunk(url: string, onSuccess: Function, onError: Function) {
        return this.chunkManager.loadChunk(url, onSuccess, onError);
    }

    public abortChunk(url: string) {
        return this.chunkManager.abortChunk(url);
    }

    public processHlsPlaylist(url: string, content: string) {
        return this.chunkManager.processHlsPlaylist(url, content);
    }

}
