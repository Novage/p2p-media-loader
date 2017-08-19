import * as sinon from "sinon";
import { mock, instance, verify, deepEqual, when, anyFunction } from "ts-mockito";

import ChunkManager from "../lib/chunk-manager";
import {LoaderEvents, Segment, LoaderInterface} from "p2p-media-loader-core";

class LoaderInterfaceEmptyImpl implements LoaderInterface {
    on(eventName: string | symbol, listener: Function): this { return this; }
    load(segments: Segment[], playlistUrl: string, emitNowSegmentUrl?: string): void { }
}

const testPlaylist = {
    url: "http://site.com/stream/playlist.m3u8",
    baseUrl: "http://site.com/stream/",
    content: `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:5
#EXTINF:5
chunk-1041.ts
#EXTINF:5.055
chunk-1042.ts
#EXTINF:6.125
chunk-1043.ts
#EXTINF:5.555
chunk-1044.ts
#EXTINF:5.555
chunk-1045.ts
#EXTINF:5.115
chunk-1046.ts
#EXTINF:5.425
chunk-1047.ts
#EXTINF:5.745
chunk-1048.ts
`
};

describe("ChunkManager", () => {

    it("should pass to LoaderInterface chunk list starting from requested one", () => {
        const loader = mock<LoaderInterface>(LoaderInterfaceEmptyImpl);
        const manager = new ChunkManager(instance(loader));
        manager.processHlsPlaylist(testPlaylist.url, testPlaylist.content);
        manager.loadChunk(testPlaylist.baseUrl + "chunk-1046.ts");
        verify(loader.load(deepEqual([
            new Segment(testPlaylist.baseUrl + "chunk-1046.ts"),
            new Segment(testPlaylist.baseUrl + "chunk-1047.ts"),
            new Segment(testPlaylist.baseUrl + "chunk-1048.ts")
        ]), testPlaylist.url, testPlaylist.baseUrl + "chunk-1046.ts")).once();
    });

    it("should pass to LoaderInterface chunk list starting from requested one (ignoring current chunk) if previously requested chunk not contiguous", () => {
        const loader = mock<LoaderInterface>(LoaderInterfaceEmptyImpl);
        const manager = new ChunkManager(instance(loader));
        manager.processHlsPlaylist(testPlaylist.url, testPlaylist.content);
        manager.loadChunk(testPlaylist.baseUrl + "chunk-1042.ts");
        manager.loadChunk(testPlaylist.baseUrl + "chunk-1043.ts");
        manager.setCurrentChunk(testPlaylist.baseUrl + "chunk-1042.ts");
        manager.loadChunk(testPlaylist.baseUrl + "chunk-1044.ts");
        manager.loadChunk(testPlaylist.baseUrl + "chunk-1047.ts");
        verify(loader.load(deepEqual([
            new Segment(testPlaylist.baseUrl + "chunk-1047.ts"),
            new Segment(testPlaylist.baseUrl + "chunk-1048.ts")
        ]), testPlaylist.url, testPlaylist.baseUrl + "chunk-1047.ts")).once();
    });

    it("should call onSuccess after chunk loading succeeded", () => {
        const loader = mock<LoaderInterface>(LoaderInterfaceEmptyImpl);

        const onSuccess = sinon.spy();
        let segmentLoadedListener: Function = () => { throw new Error("SegmentLoaded listener not set"); };
        when(loader.on(LoaderEvents.SegmentLoaded, anyFunction())).thenCall((eventName_unused, listener) => {
            segmentLoadedListener = listener;
        });

        const segment = new Segment(testPlaylist.baseUrl + "chunk-1045.ts");
        segment.data = new ArrayBuffer(0);

        const manager = new ChunkManager(instance(loader));
        manager.processHlsPlaylist(testPlaylist.url, testPlaylist.content);
        manager.loadChunk(segment.url, onSuccess);
        segmentLoadedListener(segment);

        onSuccess.calledWith(segment.data);
    });

    it("should call onError after chunk loading failed", () => {
        const loader = mock<LoaderInterface>(LoaderInterfaceEmptyImpl);

        const onError = sinon.spy();
        let segmentErrorListener: Function = () => { throw new Error("SegmentError listener not set"); };
        when(loader.on(LoaderEvents.SegmentError, anyFunction())).thenCall((eventName_unused, listener) => {
            segmentErrorListener = listener;
        });

        const url = testPlaylist.baseUrl + "chunk-1045.ts";
        const error = "Test error message content";

        const manager = new ChunkManager(instance(loader));
        manager.processHlsPlaylist(testPlaylist.url, testPlaylist.content);
        manager.loadChunk(url, undefined, onError);
        segmentErrorListener(url, error);

        onError.calledWith(error);
    });

    it("should not call onSuccess nor onError after abortChunk call", () => {
        const loader = mock<LoaderInterface>(LoaderInterfaceEmptyImpl);

        const onSuccess = sinon.spy();
        let segmentLoadedListener: Function = () => { throw new Error("SegmentLoaded listener not set"); };
        when(loader.on(LoaderEvents.SegmentLoaded, anyFunction())).thenCall((eventName_unused, listener) => {
            segmentLoadedListener = listener;
        });

        const onError = sinon.spy();
        let segmentErrorListener: Function = () => { throw new Error("SegmentError listener not set"); };
        when(loader.on(LoaderEvents.SegmentError, anyFunction())).thenCall((eventName_unused, listener) => {
            segmentErrorListener = listener;
        });

        const segment = new Segment(testPlaylist.baseUrl + "chunk-1045.ts");
        segment.data = new ArrayBuffer(0);

        const manager = new ChunkManager(instance(loader));
        manager.processHlsPlaylist(testPlaylist.url, testPlaylist.content);
        manager.loadChunk(segment.url, onSuccess, onError);
        manager.abortChunk(segment.url);
        segmentLoadedListener(segment);

        sinon.assert.notCalled(onSuccess);
        sinon.assert.notCalled(onError);
    });

});
