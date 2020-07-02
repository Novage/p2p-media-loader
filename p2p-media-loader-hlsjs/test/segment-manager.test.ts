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

/// <reference path="../lib/declarations.d.ts" />
/// <reference types="mocha" />

import { mock, instance, when, anyFunction } from "ts-mockito";
import * as assert from "assert";

import { SegmentManager } from "../lib/segment-manager";
import { Events, Segment, LoaderInterface } from "p2p-media-loader-core";

class LoaderInterfaceEmptyImpl implements LoaderInterface {
    public on(eventName: string | symbol, listener: Function): this { return this; }
    public load(segments: Segment[], swarmId: string): void { }
    public async getSegment(id: string): Promise<Segment | undefined> { return undefined; }
    public getSettings(): any { }
    public getDetails(): any { }
    public async destroy(): Promise<void> { }
}

const testPlaylist = {
    url: "http://site.com/stream/playlist.m3u8",
    baseUrl: "http://site.com/stream/",
    content: `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:5
#EXTINF:5
segment-1041.ts
#EXTINF:5.055
segment-1042.ts
#EXTINF:6.125
segment-1043.ts
#EXTINF:5.555
segment-1044.ts
#EXTINF:5.555
segment-1045.ts
#EXTINF:5.115
segment-1046.ts
#EXTINF:5.425
segment-1047.ts
#EXTINF:5.745
segment-1048.ts
`
};

describe("SegmentManager", () => {

    it("should call succeed after segment loading succeeded", async () => {
        const loader = mock<LoaderInterface>(LoaderInterfaceEmptyImpl);

        let segmentLoadedListener = (segment: Segment) => { throw new Error("SegmentLoaded listener not set"); };
        when(loader.on(Events.SegmentLoaded, anyFunction())).thenCall((_eventName, listener) => {
            segmentLoadedListener = listener;
        });

        const segment = {
            id: "id",
            url: testPlaylist.baseUrl + "segment-1045.ts",
            masterSwarmId: testPlaylist.url,
            masterManifestUri: testPlaylist.url,
            streamId: undefined,
            sequence: "1045",
            range: undefined,
            priority: 0,
            data: new ArrayBuffer(1)
        };

        const manager = new SegmentManager(instance(loader));
        manager.processPlaylist(testPlaylist.url, testPlaylist.content, testPlaylist.url);
        const promise = manager.loadSegment(segment.url, undefined);
        segmentLoadedListener(segment);

        const result = await promise;

        assert.deepEqual(result.content, segment.data);
    });

    it("should fail after segment loading failed", async () => {
        const loader = mock<LoaderInterface>(LoaderInterfaceEmptyImpl);

        let segmentErrorListener = (segment: Segment, error: any) => { throw new Error("SegmentError listener not set"); };
        when(loader.on(Events.SegmentError, anyFunction())).thenCall((_eventName, listener) => {
            segmentErrorListener = listener;
        });

        const error = "Test error message content";

        const segment = {
            id: "id",
            url: testPlaylist.baseUrl + "segment-1045.ts",
            masterSwarmId: testPlaylist.url,
            masterManifestUri: testPlaylist.url,
            streamId: undefined,
            sequence: "1045",
            range: undefined,
            priority: 0,
            data: undefined,
        };

        const manager = new SegmentManager(instance(loader));
        manager.processPlaylist(testPlaylist.url, testPlaylist.content, testPlaylist.url);
        const promise = manager.loadSegment(segment.url, undefined);
        segmentErrorListener(segment, error);

        try {
            await promise;
            assert.fail("should not succeed");
        } catch (e) {
            assert.equal(e, error);
        }
    });

    it("should return undefined content after abortSegment call", async () => {
        const loader = mock<LoaderInterface>(LoaderInterfaceEmptyImpl);

        let segmentLoadedListener = (segment: Segment) => { throw new Error("SegmentLoaded listener not set"); };
        when(loader.on(Events.SegmentLoaded, anyFunction())).thenCall((_eventName, listener) => {
            segmentLoadedListener = listener;
        });

        const segment = {
            id: "id",
            url: testPlaylist.baseUrl + "segment-1045.ts",
            masterSwarmId: testPlaylist.url,
            masterManifestUri: testPlaylist.url,
            streamId: undefined,
            sequence: "1045",
            range: undefined,
            priority: 0,
            data: new ArrayBuffer(0),
        };

        const manager = new SegmentManager(instance(loader));
        manager.processPlaylist(testPlaylist.url, testPlaylist.content, testPlaylist.url);
        const promise = manager.loadSegment(segment.url, undefined);
        manager.abortSegment(segment.url, undefined);
        segmentLoadedListener(segment);

        const result = await promise;
        assert.equal(result.content, undefined);
    });

});
