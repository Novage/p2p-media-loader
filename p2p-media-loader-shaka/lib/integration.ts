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
import { HookedShakaManifest, HookedShakaNetworkingEngine, ShakaDashManifestParserProxy, ShakaHlsManifestParserProxy } from "./manifest-parser-proxy";
import { getSchemedUri, getMasterSwarmId } from "./utils";
import { ParserSegment } from "./parser-segment";

const debug = Debug("p2pml:shaka:index");

type HookedRequest = shaka.extern.Request & { p2pml?: { player: shaka.Player, segmentManager: SegmentManager } };

export function initShakaPlayer(player: shaka.Player, segmentManager: SegmentManager): void {
    registerParserProxies();
    initializeNetworkingEngine();

    let intervalId: ReturnType<typeof setInterval> | undefined;
    let lastPlayheadTimeReported = 0;

    player.addEventListener("loading", () => {
        const handleLoading = async () => {
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = undefined;
            }

            lastPlayheadTimeReported = 0;

            const manifest = player.getManifest() as (HookedShakaManifest | null);
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
        };

        void handleLoading();
    });

    debug("register request filter");
    player.getNetworkingEngine().registerRequestFilter((requestType: shaka.net.NetworkingEngine.RequestType, request: shaka.extern.Request) => {
        (request as HookedRequest).p2pml = { player, segmentManager };
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

function processNetworkRequest(uri: string, request: HookedRequest, requestType: shaka.net.NetworkingEngine.RequestType, progressUpdated?: shaka.extern.ProgressUpdated): shaka.util.AbortableOperation<shaka.extern.Response> {
    const xhrPlugin = shaka.net.HttpXHRPlugin.parse ? shaka.net.HttpXHRPlugin.parse : shaka.net.HttpXHRPlugin;

    const { p2pml } = request;
    if (!p2pml) {
        return xhrPlugin(uri, request, requestType, progressUpdated);
    }

    const { player, segmentManager } = p2pml;
    let assetsStorage = segmentManager.getSettings().assetsStorage;
    let masterSwarmId: string | undefined;

    const networkingEngine = player.getNetworkingEngine() as HookedShakaNetworkingEngine;
    const masterManifestUri = networkingEngine?.p2pml?.masterManifestUri;

    if (assetsStorage && masterManifestUri) {
        masterSwarmId = getMasterSwarmId(masterManifestUri, segmentManager.getSettings());
    } else {
        assetsStorage = undefined;
    }

    let segment: ParserSegment | undefined;
    const manifest = player.getManifest() as HookedShakaManifest | null;

    if (requestType === shaka.net.NetworkingEngine.RequestType.SEGMENT) {
        segment = manifest?.p2pml?.parser?.find(uri, request.headers?.Range);
    }

    if (segment !== undefined && segment.streamType === "video") { // load segment using P2P loader
        debug("request", "load", segment.identity);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const promise = segmentManager.load(segment, getSchemedUri((player.getAssetUri ? player.getAssetUri() : player.getManifestUri())!), getPlayheadTime(player));

        const abort = async () => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            debug("request", "abort", segment!.identity);
            // TODO: implement abort in SegmentManager
        };

        return new shaka.util.AbortableOperation(promise, abort);
    } else if (assetsStorage && masterSwarmId && masterManifestUri) { // load or store the asset using assets storage
        const responsePromise = (async () => {
            const asset = await assetsStorage.getAsset(uri, request.headers?.Range, masterSwarmId);
            if (asset !== undefined) {
                return {
                    data: asset.data,
                    uri: asset.responseUri,
                    originalUri: asset.requestUri,
                    fromCache: true,
                    headers: {}
                };
            } else {
                const response = await xhrPlugin(uri, request, requestType, progressUpdated).promise;
                void assetsStorage.storeAsset({
                    masterManifestUri,
                    masterSwarmId: masterSwarmId,
                    requestUri: uri,
                    requestRange: request.headers?.Range,
                    responseUri: response.uri,
                    data: response.data
                });
                return response;
            }
        })();

        return new shaka.util.AbortableOperation(responsePromise, async () => undefined);
    } else { // load asset using default plugin
        return xhrPlugin(uri, request, requestType, progressUpdated);
    }
}

function getPlayheadTime(player: shaka.Player): number {
    let time = 0;

    const date = player.getPlayheadTimeAsDate();
    if (date) {
        time = date.valueOf();
        if (player.isLive()) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            time -= player.getPresentationStartTimeAsDate()!.valueOf();
        }
        time /= 1000;
    }

    return time;
}
