/**
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

import * as Debug from "debug";
import {SegmentManager} from "./segment-manager";
import {ShakaManifestParserProxy, ShakaDashManifestParserProxy, ShakaHlsManifestParserProxy} from "./manifest-parser-proxy";
import {getSchemedUri} from "./utils";

const debug = Debug("p2pml:shaka:index");

export function initShakaPlayer(player: any, segmentManager: SegmentManager) {
    registerParserProxies();
    initializeNetworkingEngine();

    let intervalId: number = 0;
    let lastPlayheadTimeReported: number = 0;

    player.addEventListener("loading", () => {
        if (intervalId > 0) {
            clearInterval(intervalId);
            intervalId = 0;
        }

        lastPlayheadTimeReported = 0;

        const manifest = player.getManifest();
        if (manifest && manifest.p2pml) {
            manifest.p2pml.parser.reset();
        }

        segmentManager.destroy();

        intervalId = setInterval(() => {
            const time = getPlayheadTime(player);
            if (time !== lastPlayheadTimeReported || player.isBuffering()) {
                segmentManager.setPlayheadTime(time);
                lastPlayheadTimeReported = time;
            }
        }, 500);
    });

    debug("register request filter");
    player.getNetworkingEngine().registerRequestFilter((requestType: number, request: any) => {
        request.p2pml = {player, segmentManager};
    });
}

function registerParserProxies() {
    debug("register parser proxies");
    shaka.media.ManifestParser.registerParserByExtension("mpd", ShakaDashManifestParserProxy);
    shaka.media.ManifestParser.registerParserByMime("application/dash+xml", ShakaDashManifestParserProxy);
    shaka.media.ManifestParser.registerParserByExtension("m3u8", ShakaHlsManifestParserProxy);
    shaka.media.ManifestParser.registerParserByMime("application/x-mpegurl", ShakaHlsManifestParserProxy);
    shaka.media.ManifestParser.registerParserByMime("application/vnd.apple.mpegurl", ShakaHlsManifestParserProxy);
}

function initializeNetworkingEngine() {
    debug("init networking engine");
    shaka.net.NetworkingEngine.registerScheme("http", processNetworkRequest);
    shaka.net.NetworkingEngine.registerScheme("https", processNetworkRequest);
}

function processNetworkRequest(uri: string, request: any, requestType: number) {
    if (!request.p2pml || requestType !== shaka.net.NetworkingEngine.RequestType.SEGMENT) {
        return shaka.net.HttpXHRPlugin(uri, request, requestType);
    }

    const {player, segmentManager} = request.p2pml;

    const manifest = player.getManifest();
    if (!manifest || !manifest.p2pml) {
        return shaka.net.HttpXHRPlugin(uri, request, requestType);
    }

    const parser: ShakaManifestParserProxy = manifest.p2pml.parser;
    const segment = parser.find(uri, request.headers.Range);
    if (!segment || segment.streamType !== "video") {
        return shaka.net.HttpXHRPlugin(uri, request, requestType);
    }

    let rejectCallback: any = null;

    debug("request", "load", segment.identity);
    const promise = new Promise((resolve, reject) => {
        rejectCallback = reject;
        segmentManager
            .load(segment, getSchemedUri(player.getManifestUri()), getPlayheadTime(player))
            .then((data: any) => resolve({ data }));
    });

    const abort = () => {
        debug("request", "abort", segment.identity);
        return rejectCallback(new shaka.util.Error(
            shaka.util.Error.Severity.RECOVERABLE,
            shaka.util.Error.Category.NETWORK,
            shaka.util.Error.Code.OPERATION_ABORTED
        ));
    };

    return new shaka.util.AbortableOperation(promise, abort);
}

function getPlayheadTime(player: any): number {
    let time = 0;

    const date = player.getPlayheadTimeAsDate();
    if (date) {
        time = date.valueOf();
        if (player.isLive()) {
            time -= player.getPresentationStartTimeAsDate().valueOf();
        }
        time /= 1000;
    }

    return time;
}
