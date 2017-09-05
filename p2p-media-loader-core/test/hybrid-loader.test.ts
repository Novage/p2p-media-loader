import HttpMediaManager from "../lib/http-media-manager";
import HybridLoader from "../lib/hybrid-loader";
import SegmentInternal from "../lib/segment-internal";
import LoaderEvents from "../lib/loader-events";
import Segment from "../lib/segment";
import MediaManagerInterface from "../lib/media-manager-interface";
import {anyFunction, anyOfClass, instance, mock, verify, when} from "ts-mockito";
import * as assert from "assert";

describe("HybridLoader", () => {

    const httpManger = mock(HttpMediaManager);
    const httpDownloads: SegmentInternal[] = [];
    when(httpManger.download(anyOfClass(SegmentInternal))).thenCall((segment) => {
        if (httpDownloads.indexOf(segment) === -1) {
            httpDownloads.push(segment);
        }
    });
    when(httpManger.abort(anyOfClass(SegmentInternal))).thenCall((segment) => {
        const index = httpDownloads.indexOf(segment);
        if (index !== -1) {
            httpDownloads.splice(index, 1);
        }
    });
    when(httpManger.getActiveDownloadsCount()).thenCall(() => {
        return httpDownloads.length;
    });
    when(httpManger.isDownloading(anyOfClass(SegmentInternal))).thenCall((segment) => {
        return httpDownloads.indexOf(segment) !== -1;
    });
    let segmentLoadedListener: Function = () => {};
    when(httpManger.on(LoaderEvents.SegmentLoaded, anyFunction())).thenCall((event, listener) => {
        segmentLoadedListener = listener;
    });

    HybridLoader.prototype["createHttpManager"] = () => instance(httpManger);

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
        verify(httpManger.on(LoaderEvents.SegmentLoaded, anyFunction())).once();

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
        verify(httpManger.download(httpDownloads[0])).once();
        assert.deepEqual(httpDownloads[0], {id: segments[0].url, url: segments[0].url, priority: segments[0].priority});

        // file loaded via http
        httpDownloads.shift();
        segmentLoadedListener(segments[0].url, segments[0].url, new ArrayBuffer(1));
        assert.equal(httpDownloads.length, 1);
        verify(httpManger.download(httpDownloads[0])).once();
        assert.deepEqual(httpDownloads[0], {id: segments[1].url, url: segments[1].url, priority: segments[1].priority});

        // load same files
        hybridLoader.load(segments, swarmId, segments[1].url);
        assert.equal(httpDownloads.length, 1);
        verify(httpManger.download(httpDownloads[0])).once();
        assert.deepEqual(httpDownloads[0], {id: segments[1].url, url: segments[1].url, priority: segments[1].priority});

        // file loaded via http
        httpDownloads.shift();
        segmentLoadedListener(segments[1].url, segments[1].url, new ArrayBuffer(2));
        assert.equal(httpDownloads.length, 1);
        verify(httpManger.download(httpDownloads[0])).once();
        assert.ok(httpDownloads[0].id === segments[2].url || httpDownloads[0].id === segments[3].url || httpDownloads[0].id === segments[4].url);

    });

});
