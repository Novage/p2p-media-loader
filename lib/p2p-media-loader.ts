import ChunkManager from "./chunk-manager";
import HttpLoader from "./http-loader";

export default class P2PMediaLoader {

    chunkManager: ChunkManager;

    constructor();

    constructor(chunkManager?: ChunkManager) {
        if (chunkManager) {
            this.chunkManager = chunkManager;
        } else {
            const httpLoader = new HttpLoader();
            this.chunkManager = new ChunkManager(httpLoader);
        }
    }

}
