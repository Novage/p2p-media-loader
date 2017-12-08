import {LoaderEvents, Segment, LoaderInterface} from "p2p-media-loader-core";
import Utils from "./utils";
import {Parser} from "m3u8-parser";

export default class SegmentManager {
    private loader: LoaderInterface;
    private masterPlaylist: Playlist | null = null;
    private variantPlaylists: Map<string, Playlist> = new Map();
    private segmentRequest: SegmentRequest | null = null;
    private playQueue: string[] = [];

    public constructor(loader: LoaderInterface) {
        this.loader = loader;
        this.loader.on(LoaderEvents.SegmentLoaded, this.onSegmentLoaded.bind(this));
        this.loader.on(LoaderEvents.SegmentError, this.onSegmentError.bind(this));
        this.loader.on(LoaderEvents.SegmentAbort, this.onSegmentAbort.bind(this));
    }

    public isSupported(): boolean {
        return this.loader.isSupported();
    }

    public processPlaylist(url: string, content: string): void {
        const parser = new Parser();
        parser.push(content);
        parser.end();

        const playlist = new Playlist(url, parser.manifest);

        if (playlist.manifest.playlists) {
            this.masterPlaylist = playlist;
            this.variantPlaylists.forEach(playlist => playlist.swarmId = this.getSwarmId(playlist.url));
            // TODO: validate that playlist was not changed
        } else {
            playlist.swarmId = this.getSwarmId(url);
            this.variantPlaylists.set(url, playlist);
            this.setPlayingSegment();
        }
    }

    public async loadPlaylist(url: string): Promise<string> {
        const content = await Utils.fetchContentAsText(url);
        this.processPlaylist(url, content);
        return content;
    }

    public loadSegment(url: string, onSuccess: (content: ArrayBuffer, downloadSpeed: number) => void, onError: (error: any) => void): void {
        const segmentLocation = this.getSegmentLocation(url);
        if (!segmentLocation) {
            Utils.fetchContentAsArrayBuffer(url)
                .then((content: ArrayBuffer) => onSuccess(content, 0))
                .catch((error: any) => onError(error));
            return;
        }

        if (this.playQueue.length > 0) {
            const prevSegmentUrl = this.playQueue[this.playQueue.length - 1];
            const prevSegmentLocation = this.getSegmentLocation(prevSegmentUrl);
            if (prevSegmentLocation && prevSegmentLocation.segmentIndex !== segmentLocation.segmentIndex - 1) {
                this.playQueue = [];
            }
        }

        if (this.segmentRequest) {
            this.segmentRequest.onError("Cancel segment request: simultaneous segment requests are not supported");
        }

        this.segmentRequest = new SegmentRequest(url, onSuccess, onError);
        this.loadSegments(segmentLocation.playlist, segmentLocation.segmentIndex, url);
    }

    public setPlayingSegment(url?: string): void {
        if (url) {
            const urlIndex = this.playQueue.indexOf(url);
            if (urlIndex >= 0) {
                this.playQueue = this.playQueue.slice(urlIndex);
            }
        }

        if (this.segmentRequest) {
            const segmentLocation = this.getSegmentLocation(this.segmentRequest.url);
            if (segmentLocation) {
                this.loadSegments(segmentLocation.playlist, segmentLocation.segmentIndex);
            }
        }
    }

    public abortSegment(url: string): void {
        if (this.segmentRequest && this.segmentRequest.url === url) {
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

    private onSegmentLoaded(segment: Segment): void {
        if (this.segmentRequest && this.segmentRequest.url === segment.url) {
            this.playQueue.push(segment.url);
            this.segmentRequest.onSuccess(segment.data!.slice(0), segment.downloadSpeed);
            this.segmentRequest = null;
        }
    }

    private onSegmentError(url: string, error: any): void {
        if (this.segmentRequest && this.segmentRequest.url === url) {
            this.segmentRequest.onError(error);
            this.segmentRequest = null;
        }
    }

    private onSegmentAbort(url: string): void {
        if (this.segmentRequest && this.segmentRequest.url === url) {
            this.segmentRequest.onError("Loading aborted: internal abort");
            this.segmentRequest = null;
        }
    }

    private getSegmentLocation(url: string): { playlist: Playlist, segmentIndex: number } | undefined {
        const entries = this.variantPlaylists.values();
        for (let entry = entries.next(); !entry.done; entry = entries.next()) {
            const playlist = entry.value;
            const segmentIndex = playlist.getSegmentIndex(url);
            if (segmentIndex >= 0) {
                return { playlist: playlist, segmentIndex: segmentIndex };
            }
        }

        return undefined;
    }

    private loadSegments(playlist: Playlist, segmentIndex: number, loadUrl?: string): void {
        const segments: Segment[] = [];
        const playlistSegments: any[] = playlist.manifest.segments;
        const sequence: number = playlist.manifest.mediaSequence ? playlist.manifest.mediaSequence : 0;
        let loadSegmentId: string | null = null;

        let priority = Math.max(0, this.playQueue.length - 1);
        for (let i = segmentIndex; i < playlistSegments.length; ++i) {
            const url = playlist.getSegmentAbsoluteUrl(i);
            const id: string = (sequence + i) + "+" + playlist.swarmId;
            segments.push(new Segment(id, url, priority++));

            if (loadUrl && !loadSegmentId) {
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

    private getSwarmId(playlistUrl: string): string {
        if (this.masterPlaylist) {
            for (let i = 0; i < this.masterPlaylist.manifest.playlists.length; ++i) {
                let url = this.masterPlaylist.manifest.playlists[i].uri;
                url = Utils.isAbsoluteUrl(url) ? url : this.masterPlaylist.baseUrl + url;
                if (url === playlistUrl) {
                    return i + "+" + this.masterPlaylist.url;
                }
            }
        }

        return playlistUrl;
    }
}

class Playlist {
    public baseUrl: string;
    public swarmId: string;

    public constructor(readonly url: string, readonly manifest: any) {
        const pos = url.lastIndexOf("/");
        if (pos === -1) {
            throw new Error("Unexpected playlist URL format");
        }

        this.baseUrl = url.substring(0, pos + 1);
    }

    public getSegmentIndex(url: string): number {
        for (let i = 0; i < this.manifest.segments.length; ++i) {
            if (url === this.getSegmentAbsoluteUrl(i)) {
                return i;
            }
        }

        return -1;
    }

    public getSegmentAbsoluteUrl(index: number): string {
        const uri = this.manifest.segments[index].uri;
        return Utils.isAbsoluteUrl(uri) ? uri : this.baseUrl + uri;
    }
}

class SegmentRequest {
    public constructor(
            readonly url: string,
            readonly onSuccess: (content: ArrayBuffer, downloadSpeed: number) => void,
            readonly onError: (error: any) => void) {
    }
}
