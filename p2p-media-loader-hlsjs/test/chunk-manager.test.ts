import * as sinon from "sinon";
import { mock, instance, verify, deepEqual, when, anyFunction } from "ts-mockito";

import ChunkManager from "../lib/chunk-manager";
import LoaderFile from "../lib/loader-file";
import LoaderInterface from "../lib/loader-interface";
import LoaderEvents from "../lib/loader-events";

class LoaderInterfaceEmptyImpl implements LoaderInterface {
    on(eventName: string | symbol, listener: Function): this { return this; }
    load(files: LoaderFile[], playlistUrl: string, emitNowFileUrl?: string): void { }
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
            new LoaderFile(testPlaylist.baseUrl + "chunk-1046.ts"),
            new LoaderFile(testPlaylist.baseUrl + "chunk-1047.ts"),
            new LoaderFile(testPlaylist.baseUrl + "chunk-1048.ts")
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
            new LoaderFile(testPlaylist.baseUrl + "chunk-1047.ts"),
            new LoaderFile(testPlaylist.baseUrl + "chunk-1048.ts")
        ]), testPlaylist.url, testPlaylist.baseUrl + "chunk-1047.ts")).once();
    });

    it("should call onSuccess after chunk loading succeeded", () => {
        const loader = mock<LoaderInterface>(LoaderInterfaceEmptyImpl);

        const onSuccess = sinon.spy();
        let fileLoadedListener: Function = () => { throw new Error("FileLoaded listener not set"); };
        when(loader.on(LoaderEvents.FileLoaded, anyFunction())).thenCall((eventName_unused, listener) => {
            fileLoadedListener = listener;
        });

        const file = new LoaderFile(testPlaylist.baseUrl + "chunk-1045.ts");
        file.data = new ArrayBuffer(0);

        const manager = new ChunkManager(instance(loader));
        manager.processHlsPlaylist(testPlaylist.url, testPlaylist.content);
        manager.loadChunk(file.url, onSuccess);
        fileLoadedListener(file);

        onSuccess.calledWith(file.data);
    });

    it("should call onError after chunk loading failed", () => {
        const loader = mock<LoaderInterface>(LoaderInterfaceEmptyImpl);

        const onError = sinon.spy();
        let fileErrorListener: Function = () => { throw new Error("FileError listener not set"); };
        when(loader.on(LoaderEvents.FileError, anyFunction())).thenCall((eventName_unused, listener) => {
            fileErrorListener = listener;
        });

        const url = testPlaylist.baseUrl + "chunk-1045.ts";
        const error = "Test error message content";

        const manager = new ChunkManager(instance(loader));
        manager.processHlsPlaylist(testPlaylist.url, testPlaylist.content);
        manager.loadChunk(url, undefined, onError);
        fileErrorListener(url, error);

        onError.calledWith(error);
    });

    it("should not call onSuccess nor onError after abortChunk call", () => {
        const loader = mock<LoaderInterface>(LoaderInterfaceEmptyImpl);

        const onSuccess = sinon.spy();
        let fileLoadedListener: Function = () => { throw new Error("FileLoaded listener not set"); };
        when(loader.on(LoaderEvents.FileLoaded, anyFunction())).thenCall((eventName_unused, listener) => {
            fileLoadedListener = listener;
        });

        const onError = sinon.spy();
        let fileErrorListener: Function = () => { throw new Error("FileError listener not set"); };
        when(loader.on(LoaderEvents.FileError, anyFunction())).thenCall((eventName_unused, listener) => {
            fileErrorListener = listener;
        });

        const file = new LoaderFile(testPlaylist.baseUrl + "chunk-1045.ts");
        file.data = new ArrayBuffer(0);

        const manager = new ChunkManager(instance(loader));
        manager.processHlsPlaylist(testPlaylist.url, testPlaylist.content);
        manager.loadChunk(file.url, onSuccess, onError);
        manager.abortChunk(file.url);
        fileLoadedListener(file);

        sinon.assert.notCalled(onSuccess);
        sinon.assert.notCalled(onError);
    });

});
