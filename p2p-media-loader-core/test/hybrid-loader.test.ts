import HttpMediaManager from "../lib/http-media-manager";
import HybridLoader from "../lib/hybrid-loader";
import SegmentInternal from "../lib/segment-internal";
import {LoaderEvents, Segment} from "../lib/loader-interface";
import {anyFunction, anyOfClass, anyString, instance, mock, verify, when} from "ts-mockito";
import * as assert from "assert";
import {P2PMediaManager, P2PMediaManagerEvents} from "../lib/p2p-media-manager";
import {MediaPeerEvents} from "../lib/media-peer";

describe("HybridLoader", () => {

    // HttpMediaManager mock
    const httpMediaManger = mock(HttpMediaManager);
    const httpDownloads: SegmentInternal[] = [];
    when(httpMediaManger.download(anyOfClass(SegmentInternal))).thenCall((segment) => {
        if (httpDownloads.indexOf(segment) === -1) {
            httpDownloads.push(segment);
        }
    });
    when(httpMediaManger.abort(anyOfClass(SegmentInternal))).thenCall((segment) => {
        const index = httpDownloads.indexOf(segment);
        if (index !== -1) {
            httpDownloads.splice(index, 1);
        }
    });
    when(httpMediaManger.getActiveDownloadsCount()).thenCall(() => {
        return httpDownloads.length;
    });
    when(httpMediaManger.isDownloading(anyOfClass(SegmentInternal))).thenCall((segment) => {
        return httpDownloads.indexOf(segment) !== -1;
    });
    let httpSegmentLoadedListener: Function = () => {};
    when(httpMediaManger.on(LoaderEvents.SegmentLoaded, anyFunction())).thenCall((event, listener) => {
        httpSegmentLoadedListener = listener;
    });
    let httpSegmentErrorListener: Function = () => {};
    when(httpMediaManger.on(LoaderEvents.SegmentError, anyFunction())).thenCall((event, listener) => {
        httpSegmentErrorListener = listener;
    });
    let httpPieceBytesLoadedListener: Function = () => {};
    when(httpMediaManger.on(LoaderEvents.PieceBytesLoaded, anyFunction())).thenCall((event, listener) => {
        httpPieceBytesLoadedListener = listener;
    });

    // P2PMediaManager mock
    const p2pMediaManager = mock(P2PMediaManager);
    const p2pAvailableFiles: SegmentInternal[] = [];
    const p2pDownloads: SegmentInternal[] = [];
    let swarmId: String;
    when(p2pMediaManager.download(anyOfClass(SegmentInternal))).thenCall((segment) => {
        if (p2pDownloads.indexOf(segment) === -1 && p2pAvailableFiles.filter((p) => p.id == segment.id).length === 1) {
            p2pDownloads.push(segment);
        }
    });
    when(p2pMediaManager.abort(anyOfClass(SegmentInternal))).thenCall((segment) => {
        const index = p2pDownloads.indexOf(segment);
        if (index !== -1) {
            p2pDownloads.splice(index, 1);
        }
    });
    when(p2pMediaManager.getActiveDownloadsCount()).thenCall(() => {
        return p2pDownloads.length;
    });
    when(p2pMediaManager.isDownloading(anyOfClass(SegmentInternal))).thenCall((segment) => {
        return p2pDownloads.indexOf(segment) !== -1;
    });
    when(p2pMediaManager.setSwarmId(anyString())).thenCall((id) => {
        swarmId = id;
    });
    let p2pSegmentLoadedListener: Function = () => {};
    when(p2pMediaManager.on(LoaderEvents.SegmentLoaded, anyFunction())).thenCall((event, listener) => {
        p2pSegmentLoadedListener = listener;
    });
    let p2pSegmentErrorListener: Function = () => {};
    when(p2pMediaManager.on(LoaderEvents.SegmentError, anyFunction())).thenCall((event, listener) => {
        p2pSegmentErrorListener = listener;
    });
    let p2pForceProcessingListener: Function = () => {};
    when(p2pMediaManager.on(P2PMediaManagerEvents.ForceProcessing, anyFunction())).thenCall((event, listener) => {
        p2pForceProcessingListener = listener;
    });
    let p2pPieceBytesLoadedListener: Function = () => {};
    when(p2pMediaManager.on(LoaderEvents.PieceBytesLoaded, anyFunction())).thenCall((event, listener) => {
        p2pPieceBytesLoadedListener = listener;
    });
    let p2pPeerConnectListener: Function = () => {};
    when(p2pMediaManager.on(MediaPeerEvents.Connect, anyFunction())).thenCall((event, listener) => {
        p2pPeerConnectListener = listener;
    });
    let p2pPeerCloseListener: Function = () => {};
    when(p2pMediaManager.on(MediaPeerEvents.Close, anyFunction())).thenCall((event, listener) => {
        p2pPeerCloseListener = listener;
    });

    HybridLoader.prototype["createHttpManager"] = () => instance(httpMediaManger);
    HybridLoader.prototype["createP2PManager"] = () => instance(p2pMediaManager);

    it("load", () => {

        const settings = {
            segmentIdGenerator: (url: string): string => url,
            cacheSegmentExpiration: 5 * 60 * 1000,
            maxCacheSegmentsCount: 20,
            requiredSegmentsCount: 2,
            useP2P: false,
            simultaneousP2PDownloads: 3,
            lastSegmentProbability: 0.05,
            lastSegmentProbabilityInterval: 1000,
            bufferSegmentsCount: 20,
            trackerAnnounce: [ "wss://tracker.btorrent.xyz/", "wss://tracker.openwebtorrent.com/" ]
        };
        const hybridLoader = new HybridLoader(settings);
        verify(httpMediaManger.on(LoaderEvents.SegmentLoaded, anyFunction())).once();


        const segments: Segment[] = [
            new Segment("u1", 0),
            new Segment("u2", 1),
            new Segment("u3", 2),
            new Segment("u4", 3),
            new Segment("u5", 4)
        ];
        const swarmId = "swarmId";

        // load
        hybridLoader.load(segments, swarmId, segments[0].url);
        assert.equal(httpDownloads.length, 1);
        verify(httpMediaManger.download(httpDownloads[0])).once();
        assert.deepEqual(httpDownloads[0], {id: segments[0].url, url: segments[0].url, priority: segments[0].priority});

        // file loaded via http
        httpDownloads.shift();
        httpSegmentLoadedListener(segments[0].url, segments[0].url, new ArrayBuffer(1));
        assert.equal(httpDownloads.length, 1);
        verify(httpMediaManger.download(httpDownloads[0])).once();
        assert.deepEqual(httpDownloads[0], {id: segments[1].url, url: segments[1].url, priority: segments[1].priority});

        // load same files
        hybridLoader.load(segments, swarmId, segments[1].url);
        assert.equal(httpDownloads.length, 1);
        verify(httpMediaManger.download(httpDownloads[0])).once();
        assert.deepEqual(httpDownloads[0], {id: segments[1].url, url: segments[1].url, priority: segments[1].priority});

        // file loaded via http
        httpDownloads.shift();
        httpSegmentLoadedListener(segments[1].url, segments[1].url, new ArrayBuffer(2));
        assert.equal(httpDownloads.length, 1);
        verify(httpMediaManger.download(httpDownloads[0])).once();
        assert.ok(httpDownloads[0].id === segments[2].url || httpDownloads[0].id === segments[3].url || httpDownloads[0].id === segments[4].url);

        const i = httpDownloads[0].id === segments[2].url ? 3 : 2;
        p2pAvailableFiles.push(new SegmentInternal(segments[i].url, segments[i].url, segments[i].priority));
        p2pForceProcessingListener();
        assert.equal(httpDownloads.length, 1);
        verify(httpMediaManger.download(httpDownloads[0])).once();
        assert.ok(httpDownloads[0].id === segments[2].url || httpDownloads[0].id === segments[3].url || httpDownloads[0].id === segments[4].url);
        assert.equal(p2pDownloads.length, 1);
        //verify(p2pMediaManager.download(p2pDownloads[0])).once();
        //assert.ok(httpDownloads[0].id === segments[2].url || httpDownloads[0].id === segments[3].url || httpDownloads[0].id === segments[4].url);

    });

});
