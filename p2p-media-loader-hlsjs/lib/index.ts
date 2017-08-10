import {HybridLoader} from "p2p-media-loader-core";
import ChunkManager from "./chunk-manager";
import HlsJsLoader from "./hlsjs-loader";
const createHlsJsLoaderClass = require("./hlsjs-loader-class");

export function createLoaderClass(chunkManager: ChunkManager): any {
    return createHlsJsLoaderClass(HlsJsLoader, chunkManager);
}

export function initHlsJsPlayer(player: any, settings: any = {}): void {
    const chunkManager: ChunkManager = settings.chunkManager || new ChunkManager(new HybridLoader());
    player.config.loader = createLoaderClass(chunkManager);

    player.on("hlsFragChanged", function (event: any, data: any) {
        const url = data && data.frag ? data.frag.url : undefined;
        chunkManager.setCurrentChunk(url);
    });
}

export function initClapprPlayer(player: any, settings: any = {}): void {
    player.on("play", function () {
        const playback = player.core.getCurrentPlayback();
        const hlsInstance = playback._hls;
        if (hlsInstance && hlsInstance.config && hlsInstance.config.loader && typeof hlsInstance.config.loader.getChunkManager !== "function") {
            initHlsJsPlayer(hlsInstance, settings);
            if (player.isPlaying()) {
                const chunkManager: ChunkManager = hlsInstance.config.loader.getChunkManager();
                chunkManager.loadHlsPlaylist(player.options.source, true);
            }
        }
    });
}

export {default as ChunkManager} from "./chunk-manager";
