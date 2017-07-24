import { expect } from "chai";

import ChunkManager from "../lib/chunk-manager";
/*import LoaderEvents from "../lib/loader-events";
import LoaderFile from "../lib/loader-file";
import LoaderInterface from "../lib/loader-interface";*/

/*class TestLoader implements LoaderInterface {
    subs: (string | symbol)[] = [];
    on(eventName: string | symbol, listener: Function): this {
        this.subs.push(eventName);
        return this;
    }
    load(files: LoaderFile[]): void {
        throw new Error("Method not implemented.");
    }
}*/

describe("ChunkManager", () => {

    /*it("should subscribe to LoaderEvents", () => {
        const tl = new TestLoader();
        const cm = new ChunkManager(tl);
        expect(tl.subs.indexOf(LoaderEvents.FileLoaded)).to.be.gte(0);
        expect(tl.subs.indexOf(LoaderEvents.FileError)).to.be.gte(0);
    });

    it("should process HLS playlist", () => {
        const tl = new TestLoader();
        const cm = new ChunkManager(tl);
        const pl = cm.processHlsPlaylist("http://site.com/stream/playlist.m3u8", "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:5\n#EXTINF:5\ntest-chunk-41.ts\n#EXTINF:5.055\ntest-chunk-42.ts\n");
        expect(pl).to.be.not.empty;
        expect(pl.manifest).to.be.not.empty;
        expect(pl.manifest.segments).to.be.not.empty;
        expect(pl.manifest.segments.length).to.equal(2);
    });*/

});
