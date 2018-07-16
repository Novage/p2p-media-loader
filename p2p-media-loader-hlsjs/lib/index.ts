import {HybridLoader} from "p2p-media-loader-core";
import SegmentManager from "./segment-manager";
import HlsJsLoader from "./hlsjs-loader";
import {createHlsJsLoaderClass} from "./hlsjs-loader-class";

function initHlsJsEvents(player: any, segmentManager: SegmentManager): void {
    player.on("hlsFragChanged", function (event: any, data: any) {
        const url = data && data.frag ? data.frag.url : undefined;
        segmentManager.setPlayingSegment(url);
    });
    player.on("hlsDestroying", function () {
        segmentManager.destroy();
    });
}

export function createLoaderClass(settings: any = {}): any {
    const manager: SegmentManager = settings.segmentManager || new SegmentManager(new HybridLoader(settings.loaderSettings));
    return createHlsJsLoaderClass(HlsJsLoader, manager);
}

export function initHlsJsPlayer(player: any): void {
    if (player && player.config && player.config.loader && typeof player.config.loader.getSegmentManager === "function") {
        initHlsJsEvents(player, player.config.loader.getSegmentManager());
    }
}

export function initClapprPlayer(player: any): void {
    player.on("play", () => {
        const playback = player.core.getCurrentPlayback();
        if (playback._hls && !playback._hls._p2pm_linitialized) {
            playback._hls._p2pm_linitialized = true;
            initHlsJsPlayer(player.core.getCurrentPlayback()._hls);
        }
    });
}

export function initFlowplayerHlsJsPlayer(player: any): void {
    player.on("ready", () => initHlsJsPlayer(player.engine.hlsjs));
}

export function initVideoJsContribHlsJsPlayer(player: any): void {
    player.ready(() => {
        const options = player.tech_.options_;
        if (options && options.hlsjsConfig && options.hlsjsConfig.loader && typeof options.hlsjsConfig.loader.getSegmentManager === "function") {
            initHlsJsEvents(player.tech_, options.hlsjsConfig.loader.getSegmentManager());
        }
    });
}

export function initMediaElementJsPlayer(mediaElement: any): void {
    mediaElement.addEventListener("hlsFragChanged", (event: any) => {
        const url = event.data && event.data.length > 1 && event.data[ 1 ].frag ? event.data[ 1 ].frag.url : undefined;
        const hls = mediaElement.hlsPlayer;
        if (hls && hls.config && hls.config.loader && typeof hls.config.loader.getSegmentManager === "function") {
            const segmentManager: SegmentManager = hls.config.loader.getSegmentManager();
            segmentManager.setPlayingSegment(url);
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

export function initJwPlayer(player: any, hlsjsConfig: any): void {
    const iid = setInterval(() => {
        if (player.hls && player.hls.config) {
            clearInterval(iid);

            player.hls.config = Object.assign(player.hls.config, hlsjsConfig);
            if (!hlsjsConfig.loader) {
                player.hls.config.loader = createLoaderClass();
            }

            initHlsJsPlayer(player.hls);
        }
    }, 200);
}

export {default as SegmentManager} from "./segment-manager";
