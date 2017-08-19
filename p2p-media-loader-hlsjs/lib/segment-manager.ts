import {LoaderEvents, Segment, LoaderInterface} from "p2p-media-loader-core";
import Utils from "./utils";

const m3u8Parser = require("m3u8-parser");

export default class SegmentManager {

    private loader: LoaderInterface;
    private playlists: Map<string, Playlist> = new Map();
    private task?: Task = undefined;
    private prevLoadUrl?: string = undefined;
    private playQueue: string[] = [];

    public constructor(loader: LoaderInterface) {
        this.loader = loader;
        this.loader.on(LoaderEvents.SegmentLoaded, this.onSegmentLoaded.bind(this));
        this.loader.on(LoaderEvents.SegmentError, this.onSegmentError.bind(this));
        this.loader.on(LoaderEvents.SegmentAbort, this.onSegmentAbort.bind(this));
    }

    public processPlaylist(url: string, content: string): void {
        const parser = new m3u8Parser.Parser();
        parser.push(content);
        parser.end();
        const playlist = new Playlist(url, parser.manifest);
        this.playlists.set(url, playlist);
    }

    public async loadPlaylist(url: string, loadChildPlaylists: boolean = false): Promise<string> {
        let content = "";

        try {
            content = await Utils.fetchContent(url);
            this.processPlaylist(url, content);
        } catch (e) {
            this.playlists.delete(url);
            throw e;
        }

        if (loadChildPlaylists) {
            const playlist = this.playlists.get(url);
            if (playlist) {
                for (const childUrl of playlist.getChildPlaylistAbsoluteUrls()) {
                    Utils.fetchContent(childUrl).then((childContent) => {
                        this.processPlaylist(childUrl, childContent);
                    });
                }
            }
        }

        return content;
    }

    public loadSegment(url: string, onSuccess?: Function, onError?: Function, playlistMissRetries: number = 1): void {
        const { playlist: loadingPlaylist, segmentIndex: loadingSegmentIndex } = this.getSegmentLocation(url);
        if (!loadingPlaylist) {
            if (playlistMissRetries > 0) {
                setTimeout(() => { this.loadSegment(url, onSuccess, onError, playlistMissRetries - 1); }, 500);
            } else {
                const message = "Requested segment cannot be located in known playlists";
                console.error(message);
                if (onError) {
                    setTimeout(() => { onError(message); }, 0);
                }
            }
            return;
        }

        if (this.playQueue.length > 0) {
            const prevSegmentUrl = this.playQueue[ this.playQueue.length - 1 ];
            const { playlist: prevLoadingPlaylist, segmentIndex: prevLoadingSegmentIndex } = this.getSegmentLocation(prevSegmentUrl);
            if (prevLoadingPlaylist && prevLoadingSegmentIndex !== loadingSegmentIndex - 1) {
                //console.log("#### load sequence BREAK");
                this.playQueue = [];
            } else {
                //console.log("#### load sequential");
            }
        } else {
            //console.log("#### load first");
        }

        this.task = new Task(url, onSuccess, onError);
        this.loadSegments(loadingPlaylist, loadingSegmentIndex, url);
        this.prevLoadUrl = url;
    }

    public setCurrentSegment(url?: string): void {
        if (!url) {
            return;
        }

        const urlIndex = this.playQueue.indexOf(url);
        if (urlIndex < 0) {
            //console.log("#### play MISS");
        } else {
            //console.log("#### play hit");
            this.playQueue = this.playQueue.slice(urlIndex);
        }

        if (this.prevLoadUrl) {
            const { playlist: loadingPlaylist, segmentIndex: loadingSegmentIndex } = this.getSegmentLocation(this.prevLoadUrl);
            if (loadingPlaylist) {
                this.loadSegments(loadingPlaylist, loadingSegmentIndex);
            }
        }
    }

    public abortSegment(url: string): void {
        if (this.task && this.task.url === url) {
            this.task = undefined;
        }
    }

    public destroy(): void {
        this.loader.destroy();

        if (this.task && this.task.onError) {
            this.task.onError("Loading aborted: object destroyed");
        }
        this.task = undefined;

        this.prevLoadUrl = undefined;
        this.playlists.clear();
        this.playQueue = [];
    }

    private onSegmentLoaded(segment: Segment): void {
        if (this.task && this.task.url === segment.url) {
            this.playQueue.push(segment.url);
            if (this.task.onSuccess) {
                this.task.onSuccess(segment.data);
            }
            this.task = undefined;
        }
    }

    private onSegmentError(url: string, error: any): void {
        if (this.task && this.task.url === url) {
            if (this.task.onError) {
                this.task.onError(error);
            }
            this.task = undefined;
        }
    }

    private onSegmentAbort(url: string): void {
        if (this.task && this.task.url === url) {
            if (this.task.onError) {
                this.task.onError("Loading aborted: internal abort");
            }
            this.task = undefined;
        }
    }

    private getSegmentLocation(url?: string): { playlist?: Playlist, segmentIndex: number } {
        if (url) {
            for (const playlist of Array.from(this.playlists.values())) {
                const segmentIndex = playlist.getSegmentIndex(url);
                if (segmentIndex >= 0) {
                    return { playlist: playlist, segmentIndex: segmentIndex };
                }
            }
        }

        return { playlist: undefined, segmentIndex: -1 };
    }

    private loadSegments(playlist: Playlist, segmentIndex: number, loadUrl?: string): void {
        const segments: Segment[] = [];
        const playlistSegments: any[] = playlist.manifest.segments;

        let priority = Math.max(0, this.playQueue.length - 1);
        for (let i = segmentIndex; i < playlistSegments.length; ++i) {
            const segmentUrl = playlist.getSegmentAbsoluteUrl(i);
            segments.push(new Segment(segmentUrl, priority++));
        }

        this.loader.load(segments, this.getSwarmId(playlist), loadUrl);
        //console.log("total segments / play queue", segments.length, this.playQueue.length);
    }

    private getSwarmId(playlist: Playlist): string {
        const master = this.getMasterPlaylist();
        if (master && master.url !== playlist.url) {
            const urls = master.getChildPlaylistAbsoluteUrls();
            for (let i = 0; i < urls.length; ++i) {
                if (urls[ i ] === playlist.url) {
                    return master.url + "+" + i;
                }
            }
        }

        return playlist.url;
    }

    private getMasterPlaylist(): Playlist | undefined {
        for (const playlist of Array.from(this.playlists.values())) {
            if (!!playlist.manifest.playlists) {
                return playlist;
            }
        }
    }

}

class Playlist {

    public url: string;
    public baseUrl: string;
    public manifest: any;

    public constructor(url: string, manifest: any) {
        this.url = url;
        this.manifest = manifest;

        const pos = url.lastIndexOf("/");
        if (pos === -1) {
            throw "Unexpected playlist URL format";
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
        const uri = this.manifest.segments[ index ].uri;
        return Utils.isAbsoluteUrl(uri) ? uri : this.baseUrl + uri;
    }

    public getChildPlaylistAbsoluteUrls(): string[] {
        const urls: string[] = [];

        if (!this.manifest.playlists) {
            return urls;
        }

        for (const playlist of this.manifest.playlists) {
            const url = playlist.uri;
            urls.push(Utils.isAbsoluteUrl(url) ? url : this.baseUrl + url);
        }

        return urls;
    }

}

class Task {

    public url: string;
    public onSuccess?: Function;
    public onError?: Function;

    public constructor(url: string, onSuccess?: Function, onError?: Function) {
        this.url = url;
        this.onSuccess = onSuccess;
        this.onError = onError;
    }

}
