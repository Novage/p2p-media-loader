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
        this.settings = Object.assign(defaultSettings, settings);

        this.loader = loader;
        this.loader.on(Events.SegmentLoaded, this.onSegmentLoaded);
        this.loader.on(Events.SegmentError, this.onSegmentError);
        this.loader.on(Events.SegmentAbort, this.onSegmentAbort);
    }

    public getSettings() {
        return this.settings;
    }

    public processPlaylist(requestUrl: string, xhr: XMLHttpRequest): void {
        const parser = new Parser();
        parser.push(xhr.response);
        parser.end();

        const playlist = new Playlist(requestUrl, xhr.responseURL, parser.manifest);

        if (playlist.manifest.playlists) {
            this.masterPlaylist = playlist;

            for (const [key, playlist] of this.variantPlaylists) {
                const {swarmId, found} = this.getSwarmId(playlist.requestUrl);
                if (!found) {
                    this.variantPlaylists.delete(key);
                } else {
                    playlist.swarmId = swarmId;
                }
            }
        } else {
            const {swarmId, found} = this.getSwarmId(requestUrl);

            if (found || !this.masterPlaylist) { // do not add audio and subtitles to variants
                playlist.swarmId = swarmId;
                this.variantPlaylists.set(requestUrl, playlist);
                this.updateSegments();
            }
        }
    }

    public async loadPlaylist(url: string): Promise<XMLHttpRequest> {
        const xhr = await this.loadContent(url, "text");
        this.processPlaylist(url, xhr);
        return xhr;
    }

    public loadSegment(url: string, byterange: Byterange, onSuccess: (content: ArrayBuffer, downloadSpeed: number) => void, onError: (error: any) => void): void {
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
        } else { // the segment not found in current playlist
            const playlist = this.variantPlaylists.get(this.segmentRequest.playlistRequestUrl);
            if (playlist) {
                this.loadSegments(playlist, 0, false, {
                    url: this.segmentRequest.segmentUrl,
                    byterange: this.segmentRequest.segmentByterange,
                    sequence: this.segmentRequest.segmentSequence});
            }
        }
    }

    private onSegmentLoaded = (segment: Segment) => {
        if (this.segmentRequest && (this.segmentRequest.segmentUrl === segment.url) &&
                (byterangeToString(this.segmentRequest.segmentByterange) === segment.range)) {
            this.segmentRequest.onSuccess(segment.data!.slice(0), segment.downloadSpeed);
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

    private loadSegments(playlist: Playlist, segmentIndex: number, requestFirstSegment: boolean, notInPlaylistSegment?: {url: string, byterange: Byterange, sequence: number}): void {
        const segments: Segment[] = [];
        const playlistSegments: any[] = playlist.manifest.segments;
        const initialSequence: number = playlist.manifest.mediaSequence ? playlist.manifest.mediaSequence : 0;
        let loadSegmentId: string | null = null;

        let priority = Math.max(0, this.playQueue.length - 1);

        if (notInPlaylistSegment) {
            const url = playlist.getSegmentAbsoluteUrl(notInPlaylistSegment.url);
            const id = this.getSegmentId(playlist, notInPlaylistSegment.sequence);
            segments.push(new Segment(id, url, byterangeToString(notInPlaylistSegment.byterange), priority++));

            if (requestFirstSegment) {
                loadSegmentId = id;
            }
        }

        for (let i = segmentIndex; i < playlistSegments.length && segments.length < this.settings.forwardSegmentCount; ++i) {
            const segment = playlist.manifest.segments[i];

            const url = playlist.getSegmentAbsoluteUrl(segment.uri);
            const byterange: Byterange = segment.byterange;
            const id = this.getSegmentId(playlist, initialSequence + i);
            segments.push(new Segment(id, url, byterangeToString(byterange), priority++));

            if (requestFirstSegment && !loadSegmentId) {
                loadSegmentId = id;
            }
        }

        this.loader.load(segments, playlist.swarmId);

        if (loadSegmentId) {
            const segment = this.loader.getSegment(loadSegmentId);
            if (segment) { // Segment already loaded by loader
                this.onSegmentLoaded(segment);
            }
        }
    }

    private getSegmentId(playlist: Playlist, segmentSequence: number): string {
        return `${playlist.swarmId}+${segmentSequence}`;
    }

    private getSwarmId(playlistUrl: string): {swarmId: string, found: boolean} {
        const swarmId = (this.settings.swarmId && (this.settings.swarmId.length !== 0)) ? this.settings.swarmId : undefined;

        if (this.masterPlaylist) {
            const masterSwarmId = (swarmId ? swarmId : this.masterPlaylist.requestUrl.split("?")[0]);

            for (let i = 0; i < this.masterPlaylist.manifest.playlists.length; ++i) {
                const url = new URL(this.masterPlaylist.manifest.playlists[i].uri, this.masterPlaylist.responseUrl).toString();
                if (url === playlistUrl) {
                    return {swarmId: `${masterSwarmId}+V${i}`, found: true};
                }
            }
        }

        return {swarmId: swarmId ? swarmId : playlistUrl, found: false};
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
    public swarmId: string = "";

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
        readonly onSuccess: (content: ArrayBuffer, downloadSpeed: number) => void,
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
