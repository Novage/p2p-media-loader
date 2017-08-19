import {HybridLoader} from "p2p-media-loader-core";
import SegmentManager from "./segment-manager";
import HlsJsLoader from "./hlsjs-loader";
const createHlsJsLoaderClass = require("./hlsjs-loader-class");

const defaultLiveSyncDuration = 60;

function initHlsJsEvents(player: any, segmentManager: SegmentManager): void {
    player.on("hlsFragChanged", function (event: any, data: any) {
        const url = data && data.frag ? data.frag.url : undefined;
        segmentManager.setCurrentSegment(url);
    });
    player.on("hlsDestroying", function () {
        segmentManager.destroy();
    });
}

export function createLoaderClass(settings: any = {}): any {
    const manager: SegmentManager = settings.segmentManager || new SegmentManager(new HybridLoader(settings.loaderSettings));
    return createHlsJsLoaderClass(HlsJsLoader, manager);
}

export function initHlsJsPlayer(player: any, settings: any = {}): void {
    const loader = createLoaderClass(settings);
    player.config.loader = loader;
    player.config.liveSyncDuration = defaultLiveSyncDuration;
    initHlsJsEvents(player, loader.getSegmentManager());
}

export function initClapprPlayer(player: any, settings: any = {}): void {
    player.on("play", () => {
        const playback = player.core.getCurrentPlayback();
        const hlsInstance = playback._hls;
        if (hlsInstance && hlsInstance.config && hlsInstance.config.loader && typeof hlsInstance.config.loader.getSegmentManager !== "function") {
            initHlsJsPlayer(hlsInstance, settings);
            if (player.isPlaying()) {
                const segmentManager: SegmentManager = hlsInstance.config.loader.getSegmentManager();
                segmentManager.loadPlaylist(player.options.source, true);
            }
        }
    });
}

export function initFlowplayerHlsJsPlayer(player: any, settings: any = {}): void {
    if (player && player.engine && player.engine.hlsjs) {
        initHlsJsPlayer(player.engine.hlsjs, settings);
    }
}

export function initVideoJsContribHlsJsPlayer(player: any): void {
    player.ready(() => {
        const options = player.tech_.options_;
        if (options && options.hlsjsConfig && options.hlsjsConfig.loader && typeof options.hlsjsConfig.loader.getSegmentManager === "function") {
            const segmentManager: SegmentManager = options.hlsjsConfig.loader.getSegmentManager();
            options.hlsjsConfig.liveSyncDuration = defaultLiveSyncDuration;
            initHlsJsEvents(player.tech_, segmentManager);
        }
    });
}

export function initMediaElementJsPlayer(mediaElement: any): void {
    mediaElement.addEventListener("hlsManifestParsed", (event: any) => {
        mediaElement.hlsPlayer.config.liveSyncDuration = defaultLiveSyncDuration;
    });
    mediaElement.addEventListener("hlsFragChanged", (event: any) => {
        const url = event.data && event.data.length > 1 && event.data[ 1 ].frag ? event.data[ 1 ].frag.url : undefined;
        const hls = mediaElement.hlsPlayer;
        if (hls && hls.config && hls.config.loader && typeof hls.config.loader.getSegmentManager === "function") {
            const segmentManager: SegmentManager = hls.config.loader.getSegmentManager();
            segmentManager.setCurrentSegment(url);
        }
    });
    mediaElement.addEventListener("hlsDestroying", () => {
        const hls = mediaElement.hlsPlayer;
        if (hls && hls.config && hls.config.loader && typeof hls.config.loader.getSegmentManager === "function") {
            const segmentManager: SegmentManager = hls.config.loader.getSegmentManager();
            segmentManager.destroy();
        }
    });
}

export {default as SegmentManager} from "./segment-manager";
