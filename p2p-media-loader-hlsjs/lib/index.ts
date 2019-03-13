/**
 * @license Apache-2.0
 * Copyright 2018 Novage LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Engine} from "./engine";

export function initHlsJsPlayer(player: any): void {
    if (player && player.config && player.config.loader && typeof player.config.loader.getEngine === "function") {
        initHlsJsEvents(player, player.config.loader.getEngine());
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
    player.on("ready", () => initHlsJsPlayer(player.engine.hlsjs ? player.engine.hlsjs : player.engine.hls));
}

export function initVideoJsContribHlsJsPlayer(player: any): void {
    player.ready(() => {
        const options = player.tech_.options_;
        if (options && options.hlsjsConfig && options.hlsjsConfig.loader && typeof options.hlsjsConfig.loader.getEngine === "function") {
            initHlsJsEvents(player.tech_, options.hlsjsConfig.loader.getEngine());
        }
    });
}

export function initMediaElementJsPlayer(mediaElement: any): void {
    mediaElement.addEventListener("hlsFragChanged", (event: any) => {
        const hls = mediaElement.hlsPlayer;
        if (hls && hls.config && hls.config.loader && typeof hls.config.loader.getEngine === "function") {
            const engine: Engine = hls.config.loader.getEngine();

            if (event.data && (event.data.length > 1)) {
                const frag = event.data[1].frag;
                const byterange = (frag.byteRange.length !== 2)
                    ? undefined
                    : { offset: frag.byteRange[0], length: frag.byteRange[1] - frag.byteRange[0] };
                engine.setPlayingSegment(frag.url, byterange);
            }
        }
    });
    mediaElement.addEventListener("hlsDestroying", () => {
        const hls = mediaElement.hlsPlayer;
        if (hls && hls.config && hls.config.loader && typeof hls.config.loader.getEngine === "function") {
            const engine: Engine = hls.config.loader.getEngine();
            engine.destroy();
        }
    });
}

export function initJwPlayer(player: any, hlsjsConfig: any): void {
    const iid = setInterval(() => {
        if (player.hls && player.hls.config) {
            clearInterval(iid);
            Object.assign(player.hls.config, hlsjsConfig);
            initHlsJsPlayer(player.hls);
        }
    }, 200);
}

export { Engine };
export const version = typeof(__P2PML_VERSION__) === "undefined" ? "__VERSION__" : __P2PML_VERSION__;

function initHlsJsEvents(player: any, engine: Engine): void {
    player.on("hlsFragChanged", function (event_unused: any, data: any) {
        const frag = data.frag;
        const byterange = (frag.byteRange.length !== 2)
            ? undefined
            : { offset: frag.byteRange[0], length: frag.byteRange[1] - frag.byteRange[0] };
        engine.setPlayingSegment(frag.url, byterange);
    });
    player.on("hlsDestroying", function () {
        engine.destroy();
    });
}
