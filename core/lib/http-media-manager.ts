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

import * as Debug from "debug";
import STEEmitter from "./stringly-typed-event-emitter";
import {Segment} from "./loader-interface";

export class HttpMediaManager extends STEEmitter<
    "segment-loaded" | "segment-error" | "bytes-downloaded"
> {

    private xhrRequests: Map<string, XMLHttpRequest> = new Map();
    private debug = Debug("p2pml:http-media-manager");

    public constructor() {
        super();
    }

    public download(segment: Segment): void {
        if (this.isDownloading(segment)) {
            return;
        }
        this.debug("http segment download", segment.url);
        const request = new XMLHttpRequest();
        request.open("GET", segment.url, true);
        request.responseType = "arraybuffer";

        if (segment.range) {
            request.setRequestHeader("Range", segment.range);
        }

        let prevBytesLoaded = 0;
        request.onprogress = (event: any) => {
            const bytesLoaded = event.loaded - prevBytesLoaded;
            this.emit("bytes-downloaded", bytesLoaded);
            prevBytesLoaded = event.loaded;
        };

        request.onload = (event: any) => {
            this.xhrRequests.delete(segment.id);

            if (event.target.status >= 200 && 300 > event.target.status) {
                this.emit("segment-loaded", segment, event.target.response);
            } else {
                this.emit("segment-error", segment, event);
            }
        };

        request.onerror = (event: any) => {
            // TODO: retry with timeout?
            this.xhrRequests.delete(segment.id);
            this.emit("segment-error", segment, event);
        };

        this.xhrRequests.set(segment.id, request);
        request.send();
    }

    public abort(segment: Segment): void {
        const xhr = this.xhrRequests.get(segment.id);
        if (xhr) {
            xhr.abort();
            this.xhrRequests.delete(segment.id);
            this.debug("http segment abort", segment.id);
        }
    }

    public isDownloading(segment: Segment): boolean {
        return this.xhrRequests.has(segment.id);
    }

    public getActiveDownloads() {
        return this.xhrRequests;
    }

    public destroy(): void {
        this.xhrRequests.forEach(xhr => xhr.abort());
        this.xhrRequests.clear();
    }

} // end of HttpMediaManager
