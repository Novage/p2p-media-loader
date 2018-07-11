import {HybridLoader} from "p2p-media-loader-core";
import SegmentManager from "./segment-manager";
import {ShakaManifestParserProxy, ShakaDashManifestParserProxy, ShakaHlsManifestParserProxy} from "./manifest-parser-proxy";

declare const shaka: any;

const defaultSettings = {
    // The duration in seconds; used by parser to build up predicted forward segments sequence; used to predownload and share via P2P
    parserForwardDuration: 60,
    // Custom segment manager; if not set, default p2pml.shaka.SegmentManager initialized with default p2pml.core.HybridLoader will be used
    segmentManager: undefined
};

export function initShakaPlayer(player: any, settings: any = {}): void {
    if (!shaka) {
        console.error("p2pml", "window.shaka is not defined. Did you forget to include Shaka Player?");
        return;
    }

    registerParserProxies();
    initializeNetworkingEngine();

    settings = Object.assign(defaultSettings, settings);

    const segmentManager: SegmentManager = settings.segmentManager
        ? settings.segmentManager
        : new SegmentManager(new HybridLoader());

    player.addEventListener("loading", (event_unused: any) => {
        const manifest = player.getManifest();
        if (manifest && manifest.p2pml) {
            manifest.p2pml.parser.reset();
        }

        segmentManager.destroy();
    });

    player.getNetworkingEngine().registerRequestFilter((requestType: number, request: any) => {
        request.p2pml = {player, settings, segmentManager};
    });
}

function registerParserProxies() {
    shaka.media.ManifestParser.registerParserByExtension("mpd", ShakaDashManifestParserProxy);
    shaka.media.ManifestParser.registerParserByMime("application/dash+xml", ShakaDashManifestParserProxy);
    shaka.media.ManifestParser.registerParserByExtension("m3u8", ShakaHlsManifestParserProxy);
    shaka.media.ManifestParser.registerParserByMime("application/x-mpegurl", ShakaHlsManifestParserProxy);
    shaka.media.ManifestParser.registerParserByMime("application/vnd.apple.mpegurl", ShakaHlsManifestParserProxy);
}

function initializeNetworkingEngine() {
    shaka.net.NetworkingEngine.registerScheme("http", processNetworkRequest);
    shaka.net.NetworkingEngine.registerScheme("https", processNetworkRequest);
}

function processNetworkRequest (uri: string, request: any, requestType: number) {
    if (!request.p2pml || requestType !== shaka.net.NetworkingEngine.RequestType.SEGMENT) {
        return shaka.net.HttpXHRPlugin(uri, request, requestType);
    }

    const {player, settings, segmentManager} = request.p2pml;

    const manifest = player.getManifest();
    if (!manifest || !manifest.p2pml) {
        return shaka.net.HttpXHRPlugin(uri, request, requestType);
    }

    const parser: ShakaManifestParserProxy = manifest.p2pml.parser;
    const sequence = parser.getForwardSequence(uri, request.headers.Range, settings.parserForwardDuration);
    if (sequence.length === 0) {
        return shaka.net.HttpXHRPlugin(uri, request, requestType);
    }

    let rejectCallback: any = null;

    const promise = new Promise((resolve, reject) => {
        rejectCallback = reject;
        segmentManager
            .load(sequence, player.getManifestUri())
            .then((data: any) => resolve({ data }));
    });

    const abort = () => rejectCallback(new shaka.util.Error(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.OPERATION_ABORTED
    ));

    return new shaka.util.AbortableOperation(promise, abort);
}

export {default as SegmentManager} from "./segment-manager";
