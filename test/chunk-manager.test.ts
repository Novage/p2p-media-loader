import { mock, instance, verify, deepEqual } from "ts-mockito";

import ChunkManager from "../lib/chunk-manager";
import LoaderFile from "../lib/loader-file";
import LoaderInterface from "../lib/loader-interface";

class LoaderInterfaceImpl implements LoaderInterface {
    on(eventName: string | symbol, listener: Function): this { return this; }
    load(files: LoaderFile[]): void { }
}

const testPlaylist = {
    url: "http://site.com/stream/playlist.m3u8",
    baseUrl: "http://site.com/stream/",
    content: "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:5\n#EXTINF:5\ntest-chunk-41.ts\n#EXTINF:5.055\ntest-chunk-42.ts\n#EXTINF:6.125\ntest-chunk-43.ts\n#EXTINF:5.255\ntest-chunk-44.ts\n"
};

describe("ChunkManager", () => {

    it("should pass to LoaderInterface chunk list starting from loaded one", () => {
        const loader: LoaderInterface = mock(LoaderInterfaceImpl);
        const manager = new ChunkManager(instance(loader));
        manager.processHlsPlaylist(testPlaylist.url, testPlaylist.content);
        manager.loadChunk(testPlaylist.baseUrl + "test-chunk-42.ts", () => {}, () => {});
        verify(loader.load(deepEqual([
            new LoaderFile(testPlaylist.baseUrl + "test-chunk-42.ts"),
            new LoaderFile(testPlaylist.baseUrl + "test-chunk-43.ts"),
            new LoaderFile(testPlaylist.baseUrl + "test-chunk-44.ts")
        ]), testPlaylist.url)).once();
    });

    //it("should call onSuccess after chunk loading succeeded", () => {});
    //it("should call onError after chunk loading failed", () => {});
    //it("should not call onSuccess nor onError after abortChunk call", () => {});

});
