import {HybridLoader} from "p2p-media-loader-core";
import ChunkManager from "./chunk-manager";
import HlsJsLoader from "./hlsjs-loader";
const createHlsJsLoaderClass = require("./hlsjs-loader-class");

export function createLoaderClass(chunkManager: ChunkManager) {
    return createHlsJsLoaderClass(HlsJsLoader, chunkManager);
}

export function initPlayer(player: any, loaderClass?: any) {
    let hlsjsLoader: any;
    let chunkManager: ChunkManager;

    if (loaderClass) {
        hlsjsLoader = loaderClass;
        chunkManager = loaderClass.getChunkManager();
    } else {
        const hybridLoader = new HybridLoader();
        chunkManager = new ChunkManager(hybridLoader);
        hlsjsLoader = createLoaderClass(chunkManager);
    }

    player.config.loader = hlsjsLoader;

    player.on("hlsFragChanged", function (event: any, data: any) {
        const url = data && data.frag ? data.frag.url : undefined;
        chunkManager.setCurrentChunk(url);
    });
}

export {default as ChunkManager} from "./chunk-manager";
