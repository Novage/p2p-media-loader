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

import Debug from "debug";
import { SegmentManager } from "./segment-manager";
import { ShakaDashManifestParserProxy, ShakaHlsManifestParserProxy } from "./manifest-parser-proxy";
import { getSchemedUri, getMasterSwarmId } from "./utils";
import { ParserSegment } from "./parser-segment";

const debug = Debug("p2pml:shaka:index");

export function initShakaPlayer(player: any, segmentManager: SegmentManager) {
    registerParserProxies();
    initializeNetworkingEngine();

    let intervalId: number = 0;
    let lastPlayheadTimeReported: number = 0;

    player.addEventListener("loading", async () => {
        if (intervalId > 0) {
            clearInterval(intervalId);
            intervalId = 0;
        }

        lastPlayheadTimeReported = 0;

        const manifest = player.getManifest();
        if (manifest && manifest.p2pml) {
            manifest.p2pml.parser.reset();
        }

        await segmentManager.destroy();

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

function processNetworkRequest(uri: string, request: any, requestType: number, progressUpdated?: Function) {
    const xhrPlugin = shaka.net.HttpXHRPlugin.parse ? shaka.net.HttpXHRPlugin.parse : shaka.net.HttpXHRPlugin;

    if (!request.p2pml) {
        return xhrPlugin(uri, request, requestType, progressUpdated);
    }

    const { player, segmentManager }: { player: any, segmentManager: SegmentManager } = request.p2pml;
    let assetsStorage = segmentManager.getSettings().assetsStorage;
    let masterManifestUri: string | undefined;
    let masterSwarmId: string | undefined;

    if (assetsStorage !== undefined
            && player.getNetworkingEngine().p2pml !== undefined
            && player.getNetworkingEngine().p2pml.masterManifestUri !== undefined) {
        masterManifestUri = player.getNetworkingEngine().p2pml.masterManifestUri as string;
        masterSwarmId = getMasterSwarmId(masterManifestUri, segmentManager.getSettings());
    } else {
        assetsStorage = undefined;
    }

    let segment: ParserSegment | undefined;
    const manifest = player.getManifest();

    if (requestType === shaka.net.NetworkingEngine.RequestType.SEGMENT
            && manifest !== null
            && manifest.p2pml !== undefined
            && manifest.p2pml.parser !== undefined) {
        segment = manifest.p2pml.parser.find(uri, request.headers.Range);
    }

    if (segment !== undefined && segment.streamType === "video") { // load segment using P2P loader
        debug("request", "load", segment.identity);

        const promise = segmentManager.load(segment, getSchemedUri(player.getAssetUri ? player.getAssetUri() : player.getManifestUri()), getPlayheadTime(player));

        const abort = async () => {
            debug("request", "abort", segment!.identity);
            // TODO: implement abort in SegmentManager
        };

        return new shaka.util.AbortableOperation(promise, abort);
    } else if (assetsStorage) { // load or store the asset using assets storage
        const responsePromise = (async () => {
            const asset = await assetsStorage.getAsset(uri, request.headers.Range, masterSwarmId!);
            if (asset !== undefined) {
                return {
                    data: asset.data,
                    uri: asset.responseUri,
                    fromCache: true
                };
            } else {
                const response = await xhrPlugin(uri, request, requestType, progressUpdated).promise;
                assetsStorage.storeAsset({
                    masterManifestUri: masterManifestUri!,
                    masterSwarmId: masterSwarmId!,
                    requestUri: uri,
                    requestRange: request.headers.Range,
                    responseUri: response.uri,
                    data: response.data
                });
                return response;
            }
        })();
        return new shaka.util.AbortableOperation(responsePromise, async () => {});
    } else { // load asset using default plugin
        return xhrPlugin(uri, request, requestType, progressUpdated);
    }
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
