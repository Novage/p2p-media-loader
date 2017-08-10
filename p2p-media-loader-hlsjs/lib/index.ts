import {HybridLoader} from "p2p-media-loader-core";
import ChunkManager from "./chunk-manager";
import HlsJsLoader from "./hlsjs-loader";
const createHlsJsLoaderClass = require("./hlsjs-loader-class");

export function initPlayer(player: any, settings: any = {}) {
    const chunkManager: ChunkManager = settings.chunkManager || new ChunkManager(new HybridLoader());
    player.config.loader = createHlsJsLoaderClass(HlsJsLoader, chunkManager);

    player.on("hlsFragChanged", function (event: any, data: any) {
        const url = data && data.frag ? data.frag.url : undefined;
        chunkManager.setCurrentChunk(url);
    });
}

export {default as ChunkManager} from "./chunk-manager";
