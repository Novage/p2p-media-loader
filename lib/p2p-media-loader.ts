import ChunkManager from "./chunk-manager";
import HttpLoader from "./http-loader";
import HlsJsLoader from "./hlsjs-loader";
const getHlsJsLoaderMaker = require("./hlsjs-loader-maker");

export default class P2PMediaLoader {

    private chunkManager: ChunkManager;

    public constructor();

    public constructor(chunkManager?: ChunkManager) {
        if (chunkManager) {
            this.chunkManager = chunkManager;
        } else {
            const httpLoader = new HttpLoader();
            this.chunkManager = new ChunkManager(httpLoader);
        }
    }

    public getHlsJsLoader() {
        return getHlsJsLoaderMaker(HlsJsLoader, this);
    }

    public async loadHlsPlaylist(url: string) {
        return this.chunkManager.loadHlsPlaylist(url);
    }

    public async loadChunk(url: string) {
        return this.chunkManager.loadChunk(url);
    }

    public processHlsPlaylist(url: string, content: string) {
        return this.chunkManager.processHlsPlaylist(url, content);
    }

}
