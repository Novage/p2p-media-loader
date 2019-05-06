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

import {Events, Segment, LoaderInterface, XhrSetupCallback} from "p2p-media-loader-core";
import {Parser} from "m3u8-parser";

const defaultSettings: Settings = {
    forwardSegmentCount: 20,
    swarmId: undefined,
};

export type Byterange = { length: number, offset: number } | undefined;

export class SegmentManager {

    private readonly loader: LoaderInterface;
    private masterPlaylist: Playlist | null = null;
    private readonly variantPlaylists: Map<string, Playlist> = new Map();
    private segmentRequest: SegmentRequest | null = null;
    private playQueue: {segmentSequence: number, segmentUrl: string, segmentByterange: Byterange}[] = [];
    private readonly settings: Settings;

    public constructor(loader: LoaderInterface, settings: any = {}) {
        this.settings = { ...defaultSettings, ...settings };

        this.loader = loader;
        this.loader.on(Events.SegmentLoaded, this.onSegmentLoaded);
        this.loader.on(Events.SegmentError, this.onSegmentError);
        this.loader.on(Events.SegmentAbort, this.onSegmentAbort);
    }

    public getSettings() {
        return this.settings;
    }

    public processPlaylist(requestUrl: string, content: string, responseUrl: string): void {
        const parser = new Parser();
        parser.push(content);
        parser.end();

        const playlist = new Playlist(requestUrl, responseUrl, parser.manifest);

        if (playlist.manifest.playlists) {
            this.masterPlaylist = playlist;

            for (const [key, playlist] of this.variantPlaylists) {
                const {streamSwarmId, found, index} = this.getStreamSwarmId(playlist.requestUrl);
                if (!found) {
                    this.variantPlaylists.delete(key);
                } else {
                    playlist.streamSwarmId = streamSwarmId;
                    playlist.streamId = "V" + index.toString();
                }
            }
        } else {
            const {streamSwarmId, found, index} = this.getStreamSwarmId(requestUrl);

            if (found || (this.masterPlaylist === null)) { // do not add audio and subtitles to variants
                playlist.streamSwarmId = streamSwarmId;
                playlist.streamId = (this.masterPlaylist === null ? undefined : "V" + index.toString());
                this.variantPlaylists.set(requestUrl, playlist);
                this.updateSegments();
            }
        }
    }

    public async loadPlaylist(url: string): Promise<XMLHttpRequest> {
        const xhr = await this.loadContent(url, "text");
        this.processPlaylist(url, xhr.response as string, xhr.responseURL);
        return xhr;
    }

    public loadSegment(url: string, byterange: Byterange, onSuccess: (content: ArrayBuffer, downloadBandwidth: number) => void, onError: (error: any) => void): void {
        const segmentLocation = this.getSegmentLocation(url, byterange);
        if (!segmentLocation) {
            // Not a segment from variants; usually can be: init, audio or subtitles segment, encription key etc.
            this.loadContent(url, "arraybuffer", byterangeToString(byterange))
                .then((xhr: XMLHttpRequest) => onSuccess(xhr.response as ArrayBuffer, 0))
                .catch((error: any) => onError(error));
            return;
        }

        const segmentSequence = (segmentLocation.playlist.manifest.mediaSequence ? segmentLocation.playlist.manifest.mediaSequence : 0)
            + segmentLocation.segmentIndex;

        if (this.playQueue.length > 0) {
            const previousSegment = this.playQueue[this.playQueue.length - 1];
            if (previousSegment.segmentSequence !== segmentSequence - 1) {
                // Reset play queue in case of segment loading out of sequence
                this.playQueue = [];
            }
        }

        if (this.segmentRequest) {
            this.segmentRequest.onError("Cancel segment request: simultaneous segment requests are not supported");
        }

        this.segmentRequest = new SegmentRequest(url, byterange, segmentSequence, segmentLocation.playlist.requestUrl, onSuccess, onError);
        this.playQueue.push({segmentUrl: url, segmentByterange: byterange, segmentSequence: segmentSequence});
        this.loadSegments(segmentLocation.playlist, segmentLocation.segmentIndex, true);
    }

    public setPlayingSegment(url: string, byterange: Byterange): void {
        const urlIndex = this.playQueue.findIndex(segment =>
                (segment.segmentUrl == url) && compareByterange(segment.segmentByterange, byterange));

        if (urlIndex >= 0) {
            this.playQueue = this.playQueue.slice(urlIndex);
            this.updateSegments();
        }
    }

    public abortSegment(url: string, byterange: Byterange): void {
        if (this.segmentRequest && (this.segmentRequest.segmentUrl === url) &&
                compareByterange(this.segmentRequest.segmentByterange, byterange)) {
            this.segmentRequest = null;
        }
    }

    public destroy(): void {
        this.loader.destroy();

        if (this.segmentRequest) {
            this.segmentRequest.onError("Loading aborted: object destroyed");
            this.segmentRequest = null;
        }

        this.masterPlaylist = null;
        this.variantPlaylists.clear();
        this.playQueue = [];
    }

    private updateSegments(): void {
        if (!this.segmentRequest) {
            return;
        }

        const segmentLocation = this.getSegmentLocation(this.segmentRequest.segmentUrl, this.segmentRequest.segmentByterange);
        if (segmentLocation) {
            this.loadSegments(segmentLocation.playlist, segmentLocation.segmentIndex, false);
        }
    }

    private onSegmentLoaded = (segment: Segment) => {
        if (this.segmentRequest && (this.segmentRequest.segmentUrl === segment.url) &&
                (byterangeToString(this.segmentRequest.segmentByterange) === segment.range)) {
            this.segmentRequest.onSuccess(segment.data!.slice(0), segment.downloadBandwidth);
            this.segmentRequest = null;
        }
    }

    private onSegmentError = (segment: Segment, error: any) => {
        if (this.segmentRequest && (this.segmentRequest.segmentUrl === segment.url) &&
                (byterangeToString(this.segmentRequest.segmentByterange) === segment.range)) {
            this.segmentRequest.onError(error);
            this.segmentRequest = null;
        }
    }

    private onSegmentAbort = (segment: Segment) => {
        if (this.segmentRequest && (this.segmentRequest.segmentUrl === segment.url) &&
                (byterangeToString(this.segmentRequest.segmentByterange) === segment.range)) {
            this.segmentRequest.onError("Loading aborted: internal abort");
            this.segmentRequest = null;
        }
    }

    private getSegmentLocation(url: string, byterange: Byterange): { playlist: Playlist, segmentIndex: number } | undefined {
        for (const playlist of this.variantPlaylists.values()) {
            const segmentIndex = playlist.getSegmentIndex(url, byterange);
            if (segmentIndex >= 0) {
                return { playlist: playlist, segmentIndex: segmentIndex };
            }
        }

        return undefined;
    }

    private loadSegments(playlist: Playlist, segmentIndex: number, requestFirstSegment: boolean): void {
        const segments: Segment[] = [];
        const playlistSegments: any[] = playlist.manifest.segments;
        const initialSequence: number = playlist.manifest.mediaSequence ? playlist.manifest.mediaSequence : 0;
        let loadSegmentId: string | null = null;

        let priority = Math.max(0, this.playQueue.length - 1);

        const masterSwarmId = this.getMasterSwarmId();

        for (let i = segmentIndex; i < playlistSegments.length && segments.length < this.settings.forwardSegmentCount; ++i) {
            const segment = playlist.manifest.segments[i];

            const url = playlist.getSegmentAbsoluteUrl(segment.uri);
            const byterange: Byterange = segment.byterange;
            const id = this.getSegmentId(playlist, initialSequence + i);
            segments.push(new Segment(
                id,
                url,
                masterSwarmId !== undefined ? masterSwarmId : playlist.streamSwarmId,
                this.masterPlaylist !== null ? this.masterPlaylist.requestUrl : playlist.requestUrl,
                playlist.streamId,
                (initialSequence + i).toString(),
                byterangeToString(byterange), priority++));
            if (requestFirstSegment && !loadSegmentId) {
                loadSegmentId = id;
            }
        }

        this.loader.load(segments, playlist.streamSwarmId);

        if (loadSegmentId) {
            const segment = this.loader.getSegment(loadSegmentId);
            if (segment) { // Segment already loaded by loader
                this.onSegmentLoaded(segment);
            }
        }
    }

    private getSegmentId(playlist: Playlist, segmentSequence: number): string {
        return `${playlist.streamSwarmId}+${segmentSequence}`;
    }

    private getMasterSwarmId() {
        const settingsSwarmId = (this.settings.swarmId && (this.settings.swarmId.length !== 0)) ? this.settings.swarmId : undefined;
        if (settingsSwarmId !== undefined) {
            return settingsSwarmId;
        }

        return (this.masterPlaylist !== null)
            ? this.masterPlaylist.requestUrl.split("?")[0]
            : undefined;
    }

    private getStreamSwarmId(playlistUrl: string): {streamSwarmId: string, found: boolean, index: number} {
        const masterSwarmId = this.getMasterSwarmId();

        if (this.masterPlaylist !== null) {
            for (let i = 0; i < this.masterPlaylist.manifest.playlists.length; ++i) {
                const url = new URL(this.masterPlaylist.manifest.playlists[i].uri, this.masterPlaylist.responseUrl).toString();
                if (url === playlistUrl) {
                    return {streamSwarmId: `${masterSwarmId}+V${i}`, found: true, index: i};
                }
            }
        }

        return {
            streamSwarmId: masterSwarmId !== undefined ? masterSwarmId : playlistUrl.split("?")[0],
            found: false,
            index: -1
        };
    }

    private async loadContent(url: string, responseType: XMLHttpRequestResponseType, range?: string): Promise<XMLHttpRequest> {
        return new Promise<XMLHttpRequest>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", url, true);
            xhr.responseType = responseType;

            if (range) {
                xhr.setRequestHeader("Range", range);
            }

            xhr.addEventListener("readystatechange", () => {
                if (xhr.readyState !== 4) { return; }
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(xhr);
                } else {
                    reject(xhr.statusText);
                }
            });

            const xhrSetup: XhrSetupCallback = this.loader.getSettings().xhrSetup;
            if (xhrSetup) {
                xhrSetup(xhr, url);
            }

            xhr.send();
        });
    }

}

class Playlist {
    public streamSwarmId: string = "";
    public streamId?: string;

    public constructor(readonly requestUrl: string, readonly responseUrl: string, readonly manifest: any) {}

    public getSegmentIndex(url: string, byterange: Byterange): number {
        for (let i = 0; i < this.manifest.segments.length; ++i) {
            const segment = this.manifest.segments[i];
            const segmentUrl = this.getSegmentAbsoluteUrl(segment.uri);

            if ((url === segmentUrl) && compareByterange(segment.byterange, byterange)) {
                return i;
            }
        }

        return -1;
    }

    public getSegmentAbsoluteUrl(segmentUrl: string): string {
        return new URL(segmentUrl, this.responseUrl).toString();
    }
}

class SegmentRequest {
    public constructor(
        readonly segmentUrl: string,
        readonly segmentByterange: Byterange,
        readonly segmentSequence: number,
        readonly playlistRequestUrl: string,
        readonly onSuccess: (content: ArrayBuffer, downloadBandwidth: number) => void,
        readonly onError: (error: any) => void
    ) {}
}

interface Settings {
    /**
     * Number of segments for building up predicted forward segments sequence; used to predownload and share via P2P
     */
    forwardSegmentCount: number;

    /**
     * Override default swarm ID that is used to identify unique media stream with trackers (manifest URL without
     * query parameters is used as the swarm ID if the parameter is not specified)
     */
    swarmId?: string;
}

function compareByterange(b1: Byterange, b2: Byterange) {
    return (b1 === undefined)
        ? (b2 === undefined)
        : ((b2 !== undefined) && (b1.length === b2.length) && (b1.offset === b2.offset));
}

function byterangeToString(byterange: Byterange): string | undefined {
    if (byterange === undefined) {
        return undefined;
    }

    const end = byterange.offset + byterange.length - 1;

    return `bytes=${byterange.offset}-${end}`;
}
