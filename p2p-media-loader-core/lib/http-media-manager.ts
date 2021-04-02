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

import Debug from "debug";

import { STEEmitter } from "./stringly-typed-event-emitter";
import { Segment } from "./loader-interface";
import { SegmentValidatorCallback, XhrSetupCallback, SegmentUrlBuilder } from "./hybrid-loader";

export class HttpMediaManager extends STEEmitter<"segment-loaded" | "segment-error" | "bytes-downloaded"> {
    private xhrRequests = new Map<string, { xhr: XMLHttpRequest; segment: Segment }>();
    private failedSegments = new Map<string, number>();
    private debug = Debug("p2pml:http-media-manager");

    public constructor(
        readonly settings: {
            httpFailedSegmentTimeout: number;
            httpUseRanges: boolean;
            segmentValidator?: SegmentValidatorCallback;
            xhrSetup?: XhrSetupCallback;
            segmentUrlBuilder?: SegmentUrlBuilder;
        }
    ) {
        super();
    }

    public download = (segment: Segment, downloadedPieces?: ArrayBuffer[]): void => {
        if (this.isDownloading(segment)) {
            return;
        }

        this.cleanTimedOutFailedSegments();

        const segmentUrl = this.settings.segmentUrlBuilder ? this.settings.segmentUrlBuilder(segment) : segment.url;

        this.debug("http segment download", segmentUrl);

        segment.requestUrl = segmentUrl;

        const xhr = new XMLHttpRequest();
        xhr.open("GET", segmentUrl, true);
        xhr.responseType = "arraybuffer";

        if (segment.range) {
            xhr.setRequestHeader("Range", segment.range);
            downloadedPieces = undefined; // TODO: process downloadedPieces for segments with range headers too
        } else if (downloadedPieces !== undefined && this.settings.httpUseRanges) {
            let bytesDownloaded = 0;
            for (const piece of downloadedPieces) {
                bytesDownloaded += piece.byteLength;
            }

            xhr.setRequestHeader("Range", `bytes=${bytesDownloaded}-`);

            this.debug("continue download from", bytesDownloaded);
        } else {
            downloadedPieces = undefined;
        }

        this.setupXhrEvents(xhr, segment, downloadedPieces);

        if (this.settings.xhrSetup) {
            this.settings.xhrSetup(xhr, segmentUrl);
        }

        this.xhrRequests.set(segment.id, { xhr, segment });
        xhr.send();
    };

    public abort = (segment: Segment): void => {
        const request = this.xhrRequests.get(segment.id);

        if (request) {
            request.xhr.abort();
            this.xhrRequests.delete(segment.id);
            this.debug("http segment abort", segment.id);
        }
    };

    public isDownloading = (segment: Segment): boolean => {
        return this.xhrRequests.has(segment.id);
    };

    public isFailed = (segment: Segment): boolean => {
        const time = this.failedSegments.get(segment.id);
        return time !== undefined && time > this.now();
    };

    public getActiveDownloads = (): ReadonlyMap<string, { segment: Segment }> => {
        return this.xhrRequests;
    };

    public getActiveDownloadsCount = (): number => {
        return this.xhrRequests.size;
    };

    public destroy = (): void => {
        this.xhrRequests.forEach((request) => request.xhr.abort());
        this.xhrRequests.clear();
    };

    private setupXhrEvents = (xhr: XMLHttpRequest, segment: Segment, downloadedPieces?: ArrayBuffer[]) => {
        let prevBytesLoaded = 0;

        xhr.addEventListener("progress", (event) => {
            const bytesLoaded = event.loaded - prevBytesLoaded;
            this.emit("bytes-downloaded", bytesLoaded);
            prevBytesLoaded = event.loaded;
        });

        xhr.addEventListener("load", async (event) => {
            if (xhr.status < 200 || xhr.status >= 300) {
                this.segmentFailure(segment, event, xhr);
                return;
            }

            let data = xhr.response as ArrayBuffer;

            if (downloadedPieces !== undefined && xhr.status === 206) {
                let bytesDownloaded = 0;
                for (const piece of downloadedPieces) {
                    bytesDownloaded += piece.byteLength;
                }

                const segmentData = new Uint8Array(bytesDownloaded + data.byteLength);
                let offset = 0;

                for (const piece of downloadedPieces) {
                    segmentData.set(new Uint8Array(piece), offset);
                    offset += piece.byteLength;
                }

                segmentData.set(new Uint8Array(data), offset);
                data = segmentData.buffer;
            }

            await this.segmentDownloadFinished(segment, data, xhr);
        });

        xhr.addEventListener("error", (event: unknown) => {
            this.segmentFailure(segment, event, xhr);
        });

        xhr.addEventListener("timeout", (event: unknown) => {
            this.segmentFailure(segment, event, xhr);
        });
    };

    private segmentDownloadFinished = async (segment: Segment, data: ArrayBuffer, xhr: XMLHttpRequest) => {
        segment.responseUrl = xhr.responseURL === null ? undefined : xhr.responseURL;

        if (this.settings.segmentValidator) {
            try {
                await this.settings.segmentValidator({ ...segment, data: data }, "http");
            } catch (error) {
                this.debug("segment validator failed", error);
                this.segmentFailure(segment, error, xhr);
                return;
            }
        }

        this.xhrRequests.delete(segment.id);
        this.emit("segment-loaded", segment, data);
    };

    private segmentFailure = (segment: Segment, error: unknown, xhr: XMLHttpRequest) => {
        segment.responseUrl = xhr.responseURL === null ? undefined : xhr.responseURL;

        this.xhrRequests.delete(segment.id);
        this.failedSegments.set(segment.id, this.now() + this.settings.httpFailedSegmentTimeout);
        this.emit("segment-error", segment, error);
    };

    private cleanTimedOutFailedSegments = () => {
        const now = this.now();
        const candidates: string[] = [];

        this.failedSegments.forEach((time, id) => {
            if (time < now) {
                candidates.push(id);
            }
        });

        candidates.forEach((id) => this.failedSegments.delete(id));
    };

    private now = () => performance.now();
}
