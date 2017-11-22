/// <reference path="../node_modules/@types/mocha/index.d.ts" />
/// <reference path="../node_modules/@types/node/index.d.ts" />
/// <reference path="../node_modules/typescript/lib/lib.es2015.d.ts" />
/// <reference path="../node_modules/typescript/lib/lib.dom.d.ts" />

import HttpMediaManager from "../lib/http-media-manager";
import HybridLoader from "../lib/hybrid-loader";
import SegmentInternal from "../lib/segment-internal";
import {LoaderEvents, Segment} from "../lib/loader-interface";
import {anyFunction, anyOfClass, instance, mock, verify, when} from "ts-mockito";
import * as assert from "assert";
import {P2PMediaManager} from "../lib/p2p-media-manager";
import {MediaPeerSegmentStatus} from "../lib/media-peer";

describe("HybridLoader", () => {
    // HttpMediaManager mock
    const httpMediaManger = mock(HttpMediaManager);
    const httpDownloads: Map<string, SegmentInternal> = new Map();
    when(httpMediaManger.download(anyOfClass(SegmentInternal))).thenCall((segment) => {
        httpDownloads.set(segment.id, segment);
    });
    when(httpMediaManger.abort(anyOfClass(SegmentInternal))).thenCall((segment) => {
        httpDownloads.delete(segment.id);
    });
    when(httpMediaManger.getActiveDownloads()).thenCall(() => {
        return httpDownloads;
    });
    when(httpMediaManger.isDownloading(anyOfClass(SegmentInternal))).thenCall((segment) => {
        return httpDownloads.has(segment.id);
    });
    let httpSegmentLoadedListener: Function = () => {};
    when(httpMediaManger.on(LoaderEvents.SegmentLoaded, anyFunction())).thenCall((event, listener) => {
        httpSegmentLoadedListener = listener;
    });

    // P2PMediaManager mock
    const p2pMediaManager = mock(P2PMediaManager);
    const p2pAvailableFiles: SegmentInternal[] = [];
    const p2pDownloads: SegmentInternal[] = [];

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
    when(p2pMediaManager.getOvrallSegmentsMap()).thenCall(() => {
        return new Map<string, MediaPeerSegmentStatus>();
    });

    HybridLoader.prototype["createHttpManager"] = () => instance(httpMediaManger);
    HybridLoader.prototype["createP2PManager"] = () => instance(p2pMediaManager);
    HybridLoader.prototype["now"] = () => Date.now();

    it("load", () => {

        const settings = {
            segmentIdGenerator: (url: string): string => url,
            cachedSegmentExpiration: 5 * 60 * 1000,
            cachedSegmentsCount: 20,
            requiredSegmentsPriority: 1,
            useP2P: false,
            simultaneousP2PDownloads: 3,
            lastSegmentProbability: 0.05,
            lastSegmentProbabilityInterval: 1000,
            bufferedSegmentsCount: 20,
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
        assert.equal(httpDownloads.size, 1);
        let segment = httpDownloads.values().next().value;
        verify(httpMediaManger.download(segment)).once();
        assert.deepEqual(segment, {id: segments[0].url, url: segments[0].url, priority: segments[0].priority, lastAccessed: 0, data: undefined});

        // file loaded via http
        httpDownloads.clear();
        httpSegmentLoadedListener(segments[0].url, segments[0].url, new ArrayBuffer(1));
        assert.equal(httpDownloads.size, 1);
        segment = httpDownloads.values().next().value;
        verify(httpMediaManger.download(segment)).once();
        assert.deepEqual(segment, {id: segments[1].url, url: segments[1].url, priority: segments[1].priority, lastAccessed: 0, data: undefined});

        // load same files
        hybridLoader.load(segments, swarmId, segments[1].url);
        assert.equal(httpDownloads.size, 1);
        segment = httpDownloads.values().next().value;
        verify(httpMediaManger.download(segment)).once();
        assert.deepEqual(segment, {id: segments[1].url, url: segments[1].url, priority: segments[1].priority, lastAccessed: 0, data: undefined});
    });

});
