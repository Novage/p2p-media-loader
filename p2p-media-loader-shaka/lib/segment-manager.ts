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
import {Events, Segment as LoaderSegment, LoaderInterface} from "p2p-media-loader-core";
import {ParserSegment} from "./parser-segment";
import {getMasterSwarmId} from "./utils";
import {AssetsStorage} from "./engine";

const defaultSettings: Settings = {
    forwardSegmentCount: 20,
    maxHistorySegments: 50,
    swarmId: undefined,
    assetsStorage: undefined,
};

export class SegmentManager {

    private readonly debug = Debug("p2pml:shaka:sm");
    private readonly loader: LoaderInterface;
    private readonly requests: Map<string, Request> = new Map();
    private manifestUri: string = "";
    private playheadTime: number = 0;
    private readonly segmentHistory: ParserSegment[] = [];
    private readonly settings: Settings;

    public constructor(loader: LoaderInterface, settings: any = {}) {
        this.settings = { ...defaultSettings, ...settings };

        this.loader = loader;
        this.loader.on(Events.SegmentLoaded, this.onSegmentLoaded);
        this.loader.on(Events.SegmentError, this.onSegmentError);
        this.loader.on(Events.SegmentAbort, this.onSegmentAbort);
    }

    public async destroy() {
        if (this.requests.size !== 0) {
            console.error("Destroying segment manager with active request(s)!");
            this.requests.clear();
        }

        this.playheadTime = 0;
        this.segmentHistory.splice(0);

        if (this.settings.assetsStorage !== undefined) {
            await this.settings.assetsStorage.destroy();
        }

        await this.loader.destroy();
    }

    public getSettings() {
        return this.settings;
    }

    public async load(parserSegment: ParserSegment, manifestUri: string, playheadTime: number): Promise<{ data: ArrayBuffer, timeMs: number | undefined }> {
        this.manifestUri = manifestUri;
        this.playheadTime = playheadTime;

        this.pushSegmentHistory(parserSegment);

        const lastRequestedSegment = this.refreshLoad();

        const alreadyLoadedSegment = await this.loader.getSegment(lastRequestedSegment.id);

        return new Promise<{ data: ArrayBuffer, timeMs: number | undefined }>((resolve, reject) => {
            const request = new Request(lastRequestedSegment.id, resolve, reject);
            if (alreadyLoadedSegment) {
                this.reportSuccess(request, alreadyLoadedSegment);
            } else {
                this.debug("request add", request.id);
                this.requests.set(request.id, request);
            }
        });
    }

    public setPlayheadTime(time: number) {
        this.playheadTime = time;

        if (this.segmentHistory.length > 0) {
            this.refreshLoad();
        }
    }

    private refreshLoad(): LoaderSegment {
        const lastRequestedSegment = this.segmentHistory[ this.segmentHistory.length - 1 ];
        const safePlayheadTime = this.playheadTime > 0.1 ? this.playheadTime : lastRequestedSegment.start;
        const sequence: ParserSegment[] = this.segmentHistory.reduce((a: ParserSegment[], i) => {
            if (i.start >= safePlayheadTime) {
                a.push(i);
            }
            return a;
        }, []);

        if (sequence.length === 0) {
            sequence.push(lastRequestedSegment);
        }

        const lastRequestedSegmentIndex = sequence.length - 1;

        do {
            const next = sequence[ sequence.length - 1 ].next();
            if (next) {
                sequence.push(next);
            } else {
                break;
            }
        } while (sequence.length < this.settings.forwardSegmentCount);

        const masterSwarmId = getMasterSwarmId(this.manifestUri, this.settings);

        const loaderSegments: LoaderSegment[] = sequence.map((s, i) => {
            return new LoaderSegment(
                `${masterSwarmId}+${s.streamIdentity}+${s.identity}`,
                s.uri,
                masterSwarmId,
                this.manifestUri,
                s.streamIdentity,
                s.identity,
                s.range,
                i
            );
        });

        this.loader.load(loaderSegments, `${masterSwarmId}+${lastRequestedSegment.streamIdentity}`);
        return loaderSegments[ lastRequestedSegmentIndex ];
    }

    private pushSegmentHistory(segment: ParserSegment) {
        if (this.segmentHistory.length >= this.settings.maxHistorySegments) {
            this.debug("segment history auto shrink");
            this.segmentHistory.splice(0, this.settings.maxHistorySegments * 0.2);
        }

        if (this.segmentHistory.length > 0 && this.segmentHistory[ this.segmentHistory.length - 1 ].start > segment.start) {
            this.debug("segment history reset due to playhead seek back");
            this.segmentHistory.splice(0);
        }

        this.segmentHistory.push(segment);
    }

    private reportSuccess(request: Request, loaderSegment: LoaderSegment) {
        let timeMs: number | undefined = undefined;

        if (loaderSegment.downloadBandwidth > 0 && loaderSegment.data && loaderSegment.data.byteLength > 0) {
            timeMs = Math.trunc(loaderSegment.data.byteLength / loaderSegment.downloadBandwidth);
        }

        this.debug("report success", request.id);
        request.resolve({ data: loaderSegment.data!, timeMs } );
    }

    private reportError(request: Request, error: any) {
        if (request.reject) {
            this.debug("report error", request.id);
            request.reject(error);
        }
    }

    private onSegmentLoaded = (segment: LoaderSegment) => {
        if (this.requests.has(segment.id)) {
            this.reportSuccess(this.requests.get(segment.id)!, segment);
            this.debug("request delete", segment.id);
            this.requests.delete(segment.id);
        }
    }

    private onSegmentError = (segment: LoaderSegment, error: any) => {
        if (this.requests.has(segment.id)) {
            this.reportError(this.requests.get(segment.id)!, error);
            this.debug("request delete from error", segment.id);
            this.requests.delete(segment.id);
        }
    }

    private onSegmentAbort = (segment: LoaderSegment) => {
        if (this.requests.has(segment.id)) {
            this.reportError(this.requests.get(segment.id)!, "Internal abort");
            this.debug("request delete from abort", segment.id);
            this.requests.delete(segment.id);
        }
    }

} // end of SegmentManager

class Request {
    public constructor(
        readonly id: string,
        readonly resolve: (value: { data: ArrayBuffer, timeMs: number | undefined }) => void,
        readonly reject: (reason?: any) => void
    ) {}
}

interface Settings {
    /**
     * Number of segments for building up predicted forward segments sequence; used to predownload and share via P2P
     */
    forwardSegmentCount: number;

    /**
     * Maximum amount of requested segments manager should remember; used to build up sequence with correct priorities for P2P sharing
     */
    maxHistorySegments: number;

    /**
     * Override default swarm ID that is used to identify unique media stream with trackers (manifest URL without
     * query parameters is used as the swarm ID if the parameter is not specified)
     */
    swarmId?: string;

    /**
     * A storage for the downloaded assets: manifests, subtitles, init segments, DRM assets etc. By default the assets are not stored.
     */
    assetsStorage?: AssetsStorage;
}
