import {HybridLoader} from "p2p-media-loader-core";
import ChunkManager from "./chunk-manager";
import HlsJsLoader from "./hlsjs-loader";
const getHlsJsLoaderMaker = require("./hlsjs-loader-maker");

export function initPlayer(player: any) {
    const hybridLoader = new HybridLoader();
    const chunkManager = new ChunkManager(hybridLoader);
    const hlsjsLoader = getHlsJsLoaderMaker(HlsJsLoader, chunkManager);

    player.config.loader = hlsjsLoader;

    player.on("hlsFragChanged", function (event: any, data: any) {
        const url = data && data.frag ? data.frag.url : undefined;
        chunkManager.setCurrentChunk(url);
    });
}

export {default as ChunkManager} from "./chunk-manager";
