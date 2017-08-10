import {HybridLoader} from "p2p-media-loader-core";
import ChunkManager from "./chunk-manager";
import HlsJsLoader from "./hlsjs-loader";
const createHlsJsLoaderClass = require("./hlsjs-loader-class");

export function initPlayer(player: any, chunkManager?: ChunkManager) {
    if (!chunkManager) {
        const hybridLoader = new HybridLoader();
        chunkManager = new ChunkManager(hybridLoader);
    }

    let hlsjsLoader = createHlsJsLoaderClass(HlsJsLoader, chunkManager);

    player.config.loader = hlsjsLoader;

    const chunkManagerForCallback: ChunkManager = chunkManager;
    player.on("hlsFragChanged", function (event: any, data: any) {
        const url = data && data.frag ? data.frag.url : undefined;
        chunkManagerForCallback.setCurrentChunk(url);
    });
}

export {default as ChunkManager} from "./chunk-manager";
