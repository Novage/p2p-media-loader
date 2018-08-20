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

/// <reference path="../../../node_modules/@types/mocha/index.d.ts" />
/// <reference path="../../../node_modules/@types/sinon/index.d.ts" />
/// <reference path="../lib/declarations.d.ts" />

import * as sinon from "sinon";
import { mock, instance, when, anyFunction } from "ts-mockito";

import {SegmentManager} from "../lib/segment-manager";
import {Events, Segment, LoaderInterface} from "../../../core/lib/index";

class LoaderInterfaceEmptyImpl implements LoaderInterface {
    on(eventName: string | symbol, listener: Function): this { return this; }
    load(segments: Segment[], swarmId: string): void { }
    getSegment(id: string): Segment | undefined { return undefined; }
    getSettings(): any { }
    destroy(): void { }
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

    it("should call onSuccess after segment loading succeeded", () => {
        const loader = mock<LoaderInterface>(LoaderInterfaceEmptyImpl);

        const onSuccess = sinon.spy();
        let segmentLoadedListener: Function = () => { throw new Error("SegmentLoaded listener not set"); };
        when(loader.on(Events.SegmentLoaded, anyFunction())).thenCall((eventName_unused, listener) => {
            segmentLoadedListener = listener;
        });

        const segment = new Segment("id", testPlaylist.baseUrl + "segment-1045.ts", undefined, 0, new ArrayBuffer(0));

        const manager = new SegmentManager(instance(loader));
        manager.processPlaylist(testPlaylist.url, testPlaylist.content);
        manager.loadSegment(segment.url, onSuccess, () => {});
        segmentLoadedListener(segment);

        onSuccess.calledWith(segment.data);
    });

    it("should call onError after segment loading failed", () => {
        const loader = mock<LoaderInterface>(LoaderInterfaceEmptyImpl);

        const onError = sinon.spy();
        let segmentErrorListener: Function = () => { throw new Error("SegmentError listener not set"); };
        when(loader.on(Events.SegmentError, anyFunction())).thenCall((eventName_unused, listener) => {
            segmentErrorListener = listener;
        });

        const url = testPlaylist.baseUrl + "segment-1045.ts";
        const error = "Test error message content";

        const manager = new SegmentManager(instance(loader));
        manager.processPlaylist(testPlaylist.url, testPlaylist.content);
        manager.loadSegment(url, () => {}, onError);
        segmentErrorListener(url, error);

        onError.calledWith(error);
    });

    it("should not call onSuccess nor onError after abortSegment call", () => {
        const loader = mock<LoaderInterface>(LoaderInterfaceEmptyImpl);

        const onSuccess = sinon.spy();
        let segmentLoadedListener: Function = () => { throw new Error("SegmentLoaded listener not set"); };
        when(loader.on(Events.SegmentLoaded, anyFunction())).thenCall((eventName_unused, listener) => {
            segmentLoadedListener = listener;
        });

        const onError = sinon.spy();

        const segment = new Segment("id", testPlaylist.baseUrl + "segment-1045.ts", undefined, 0, new ArrayBuffer(0));

        const manager = new SegmentManager(instance(loader));
        manager.processPlaylist(testPlaylist.url, testPlaylist.content);
        manager.loadSegment(segment.url, onSuccess, onError);
        manager.abortSegment(segment.url);
        segmentLoadedListener(segment);

        sinon.assert.notCalled(onSuccess);
        sinon.assert.notCalled(onError);
    });

});
