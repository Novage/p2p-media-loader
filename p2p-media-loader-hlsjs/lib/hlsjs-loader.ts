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

import {SegmentManager} from "./segment-manager";

const DEFAULT_DOWNLOAD_LATENCY = 1;
const DEFAULT_DOWNLOAD_BANDWIDTH = 12500; // bytes per millisecond

export class HlsJsLoader {
    private segmentManager: SegmentManager;
    private readonly stats: any = {}; // required for older versions of hls.js

    public constructor(segmentManager: SegmentManager) {
        this.segmentManager = segmentManager;
    }

    public load(context: any, config_unused: any, callbacks: any): void {
        if (context.type) {
            this.segmentManager.loadPlaylist(context.url)
                .then((xhr: XMLHttpRequest) => this.successPlaylist(xhr, context, callbacks))
                .catch((error: any) => this.error(error, context, callbacks));
        } else if (context.frag) {
            this.segmentManager.loadSegment(context.url,
                (context.rangeStart == undefined) || (context.rangeEnd == undefined)
                    ? undefined
                    : { offset: context.rangeStart, length: context.rangeEnd - context.rangeStart },
                (content: ArrayBuffer, downloadBandwidth: number) => setTimeout(() => this.successSegment(content, downloadBandwidth, context, callbacks), 0),
                (error: any) => setTimeout(() => this.error(error, context, callbacks), 0)
            );
        } else {
            console.warn("Unknown load request", context);
        }
    }

    public abort(context: any): void {
        this.segmentManager.abortSegment(context.url,
            (context.rangeStart == undefined) || (context.rangeEnd == undefined)
                ? undefined
                : { offset: context.rangeStart, length: context.rangeEnd - context.rangeStart });
    }

    private successPlaylist(xhr: XMLHttpRequest, context: any, callbacks: any): void {
        const now = performance.now();

        this.stats.trequest = now - 300;
        this.stats.tfirst = now - 200;
        this.stats.tload = now;
        this.stats.loaded = xhr.response.length;

        callbacks.onSuccess({
            url: xhr.responseURL,
            data: xhr.response
        }, this.stats, context);
    }

    private successSegment(content: ArrayBuffer, downloadBandwidth: number, context: any, callbacks: any): void {
        const now = performance.now();
        const downloadTime = content.byteLength / ((downloadBandwidth <= 0) ? DEFAULT_DOWNLOAD_BANDWIDTH : downloadBandwidth);

        this.stats.trequest = now - DEFAULT_DOWNLOAD_LATENCY - downloadTime;
        this.stats.tfirst = now - downloadTime;
        this.stats.tload = now;
        this.stats.loaded = content.byteLength;

        callbacks.onSuccess({
            url: context.url,
            data: content
        }, this.stats, context);
    }

    private error(error: any, context: any, callbacks: any): void {
        callbacks.onError(error, context);
    }
}
