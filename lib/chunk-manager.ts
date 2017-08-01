import ChunkManagerInterface from "./chunk-manager-interface";
import LoaderEvents from "./loader-events";
import LoaderFile from "./loader-file";
import LoaderInterface from "./loader-interface";
import Utils from "./utils";

const m3u8Parser = require("m3u8-parser");

export default class ChunkManager implements ChunkManagerInterface {

    private loader: LoaderInterface;
    private playlists: Map<string, Playlist> = new Map();
    private chunk: Chunk | undefined = undefined;
    private prevChunkUrl: string | undefined = undefined;
    private currentChunkUrl: string | undefined = undefined;

    public constructor(loader: LoaderInterface) {
        this.loader = loader;
        this.loader.on(LoaderEvents.FileLoaded, this.onFileLoaded.bind(this));
        this.loader.on(LoaderEvents.FileError, this.onFileError.bind(this));
        this.loader.on(LoaderEvents.FileAbort, this.onFileAbort.bind(this));
    }

    public processHlsPlaylist(url: string, content: string): void {
        const parser = new m3u8Parser.Parser();
        parser.push(content);
        parser.end();
        const playlist = new Playlist(url, parser.manifest);
        this.playlists.set(url, playlist);
    }

    public async loadHlsPlaylist(url: string): Promise<string> {
        try {
            const content = await Utils.fetchContent(url);
            this.processHlsPlaylist(url, content);
            return content;
        } catch (e) {
            this.playlists.delete(url);
            throw e;
        }
    }

    public loadChunk(url: string, onSuccess?: Function, onError?: Function): void {
        const { playlist: loadingPlaylist, chunkIndex: loadingChunkIndex } = this.getChunkLocation(url);
        if (!loadingPlaylist) {
            // this should never happen in theory
            const e = "Requested chunk cannot be located in known playlists";
            console.error(e);
            if (onError) {
                setTimeout(() => { onError(e); }, 0);
            }
            return;
        }

        let hotChunkIndex: number;

        const { playlist: prevLoadingPlaylist, chunkIndex: prevLoadingChunkIndex } = this.getChunkLocation(this.prevChunkUrl);
        if (prevLoadingPlaylist
            && prevLoadingPlaylist.url === loadingPlaylist.url
            && prevLoadingChunkIndex + 1 < loadingChunkIndex) {
            // seek forward
            hotChunkIndex = loadingChunkIndex;
            this.currentChunkUrl = undefined;
        } else {
            const { playlist: playingPlaylist, chunkIndex: playingChunkIndex } = this.getChunkLocation(this.currentChunkUrl);
            if (playingPlaylist && playingPlaylist.url === loadingPlaylist.url) {
                // seek backward OR buffering forward
                hotChunkIndex = Math.min(loadingChunkIndex, playingChunkIndex);
            } else {
                // initial prebuffering OR level switch
                hotChunkIndex = loadingChunkIndex;
            }
        }

        this.chunk = new Chunk(url, onSuccess, onError);
        this.loadFiles(loadingPlaylist, hotChunkIndex, url);
        this.prevChunkUrl = url;
    }

    public abortChunk(url: string): void {
        if (this.chunk && this.chunk.url === url) {
            this.chunk = undefined;
        }
    }

    public setCurrentChunk(url?: string): void {
        this.currentChunkUrl = url;

        // we loadFiles only if currentChunkUrl is located in the same playlist as prevChunkUrl
        const { playlist: prevLoadingPlaylist, chunkIndex: prevLoadingChunkIndex } = this.getChunkLocation(this.prevChunkUrl);
        if (prevLoadingPlaylist) {
            const { playlist: playingPlaylist, chunkIndex: playingChunkIndex } = this.getChunkLocation(this.currentChunkUrl);
            if (playingPlaylist && playingPlaylist.url === prevLoadingPlaylist.url) {
                this.loadFiles(playingPlaylist, playingChunkIndex);
            }
        }
    }

    private onFileLoaded(file: LoaderFile): void {
        if (this.chunk && this.chunk.url === file.url) {
            if (this.chunk.onSuccess) {
                this.chunk.onSuccess(file.data);
            }
            this.chunk = undefined;
        }
    }

    private onFileError(url: string, error: any): void {
        if (this.chunk && this.chunk.url === url) {
            if (this.chunk.onError) {
                this.chunk.onError(error);
            }
            this.chunk = undefined;
        }
    }

    private onFileAbort(url: string): void {
        if (this.chunk && this.chunk.url === url) {
            if (this.chunk.onError) {
                this.chunk.onError("Loading aborted");
            }
            this.chunk = undefined;
        }
    }

    private getChunkLocation(url: string | undefined): { playlist: Playlist | undefined, chunkIndex: number } {
        if (url) {
            for (const playlist of Array.from(this.playlists.values())) {
                const chunkIndex = playlist.getChunkIndex(url);
                if (chunkIndex >= 0) {
                    return { playlist: playlist, chunkIndex: chunkIndex };
                }
            }
        }

        return { playlist: undefined, chunkIndex: -1 };
    }

    private loadFiles(playlist: Playlist, chunkIndex: number, loadUrl?: string): void {
        const files: LoaderFile[] = [];
        const segments: any[] = playlist.manifest.segments;
        for (let i = chunkIndex; i < segments.length; ++i) {
            const fileUrl = playlist.getChunkAbsoluteUrl(i);
            files.push(new LoaderFile(fileUrl));
        }

        this.loader.load(files, playlist.url, loadUrl);

        // debug {{{
        /*const q: string[] = [];
        for (let i = 0; i < segments.length; ++i) {
            const u = playlist.baseUrl + segments[ i ].uri;
            const id = i; // u.substr(u.length - 6, 3); // use last 3 chars without ".ts"
            const ht = i === chunkIndex ? "-HOT" : "";
            const pl = u === this.currentChunkUrl ? "-PLAYING" : "";
            const ld = u === loadUrl ? "-LOADING" : "";
            q.push(id + ht + pl + ld);
        }
        console.log("CHUNKS", q);*/
        // }}}
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

    public getChunkIndex(url: string): number {
        for (let i = 0; i < this.manifest.segments.length; ++i) {
            if (url.endsWith(this.manifest.segments[ i ].uri)) {
                return i;
            }
        }

        return -1;
    }

    public getChunkAbsoluteUrl(index: number): string {
        const uri = this.manifest.segments[ index ].uri;
        if (uri.startsWith("http://") || uri.startsWith("https://")) {
            return uri;
        } else {
            return this.baseUrl + uri;
        }
    }

}

class Chunk {

    public url: string;
    public onSuccess?: Function;
    public onError?: Function;

    public constructor(url: string, onSuccess?: Function, onError?: Function) {
        this.url = url;
        this.onSuccess = onSuccess;
        this.onError = onError;
    }

}
