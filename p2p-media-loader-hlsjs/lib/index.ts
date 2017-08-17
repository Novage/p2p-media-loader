import {HybridLoader} from "p2p-media-loader-core";
import ChunkManager from "./chunk-manager";
import HlsJsLoader from "./hlsjs-loader";
const createHlsJsLoaderClass = require("./hlsjs-loader-class");

const defaultLiveSyncDuration = 60;

export function createLoaderClass(chunkManager?: ChunkManager): any {
    const manager: ChunkManager = chunkManager || new ChunkManager(new HybridLoader());
    return createHlsJsLoaderClass(HlsJsLoader, manager);
}

export function initHlsJsPlayer(player: any, settings: any = {}): void {
    const chunkManager: ChunkManager = settings.chunkManager || new ChunkManager(new HybridLoader());
    player.config.loader = createLoaderClass(chunkManager);
    player.config.liveSyncDuration = defaultLiveSyncDuration;

    player.on("hlsFragChanged", function (event: any, data: any) {
        const url = data && data.frag ? data.frag.url : undefined;
        chunkManager.setCurrentChunk(url);
    });
}

export function initClapprPlayer(player: any, settings: any = {}): void {
    player.on("play", () => {
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

export function initVideoJsContribHlsJsPlayer(player: any): void {
    player.ready(() => {
        const options = player.tech_.options_;
        if (options && options.hlsjsConfig && options.hlsjsConfig.loader && typeof options.hlsjsConfig.loader.getChunkManager === "function") {
            const chunkManager: ChunkManager = options.hlsjsConfig.loader.getChunkManager();
            options.hlsjsConfig.liveSyncDuration = defaultLiveSyncDuration;
            player.tech_.on("hlsFragChanged", (event: any, data: any) => {
                const url = data && data.frag ? data.frag.url : undefined;
                chunkManager.setCurrentChunk(url);
            });
        }
    });
}

export function initFlowplayerHlsJsPlayer(player: any, settings: any = {}): void {
    if (player && player.engine && player.engine.hlsjs) {
        initHlsJsPlayer(player.engine.hlsjs, settings);
    }
}

export function initMediaElementJsPlayer(mediaElement: any): void {
    mediaElement.addEventListener("hlsManifestParsed", (event: any) => {
        mediaElement.hlsPlayer.config.liveSyncDuration = defaultLiveSyncDuration;
    });
    mediaElement.addEventListener("hlsFragChanged", (event: any) => {
        const url = event.data && event.data.length > 1 && event.data[ 1 ].frag ? event.data[ 1 ].frag.url : undefined;
        const hls = mediaElement.hlsPlayer;
        if (hls && hls.config && hls.config.loader && typeof hls.config.loader.getChunkManager === "function") {
            const chunkManager: ChunkManager = hls.config.loader.getChunkManager();
            chunkManager.setCurrentChunk(url);
        }
    });
}

export {default as ChunkManager} from "./chunk-manager";
