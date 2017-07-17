import ChunkManagerInterface from "./chunk-manager-interface";
import LoaderEvents from "./loader-events";
import LoaderFile from "./loader-file";
import LoaderInterface from "./loader-interface";
import Utils from "./utils";

const m3u8Parser = require("m3u8-parser");

export default class ChunkManager implements ChunkManagerInterface {

    private loader: LoaderInterface;
    private playlists: Map<string, Playlist> = new Map();
    private chunks: Map<string, Chunk> = new Map();

    public constructor(loader: LoaderInterface) {
        this.loader = loader;
        this.loader.on(LoaderEvents.FileLoaded, this.onFileLoaded.bind(this));
        this.loader.on(LoaderEvents.FileError, this.onFileError.bind(this));
    }

    public processHlsPlaylist(url: string, content: string): void {
        const parser = new m3u8Parser.Parser();
        parser.push(content);
        parser.end();
        this.playlists.set(url, new Playlist(url, parser.manifest));
    }

    public async loadHlsPlaylist(url: string): Promise<string> {
        try {
            const content = await Utils.fetchContent(url);
            this.processHlsPlaylist(url, content);
            return content;
        } catch (e) {
            this.playlists.delete(url);
            console.error("Failed to load HLS playlist", e);
            throw e;
        }
    }

    public loadChunk(url: string, onSuccess: Function, onError: Function): void {
        const newChunks: Chunk[] = [];
        const { playlist, chunkIndex } = this.getChunkLocation(url);
        if (playlist) {
            const segments: any[] = playlist.manifest.segments;
            for (let i = chunkIndex; i < segments.length; ++i) {
                const chunkUrl = playlist.baseUrl + segments[ i ].uri;
                const chunk = this.chunks.get(chunkUrl);
                newChunks.push(
                    chunkUrl === url
                        ? new Chunk(chunkUrl, onSuccess, onError)
                        : chunk
                            ? chunk
                            : new Chunk(chunkUrl)
                );
            }
        } else {
            newChunks.push(new Chunk(url, onSuccess, onError));
        }

        this.chunks.clear();
        for (const c of newChunks) {
            this.chunks.set(c.url, c);
        }

        this.loader.load(newChunks.map((c) => new LoaderFile(c.url)));
    }

    public abortChunk(url: string): void {
        this.chunks.delete(url);
    }

    private onFileLoaded(file: LoaderFile): void {
        const chunk = this.chunks.get(file.url);
        if (chunk) {
            if (chunk.onSuccess) {
                chunk.onSuccess(file.data);
                this.chunks.delete(file.url);
            } else {
                chunk.data = file.data;
            }
        }
    }

    private onFileError(url: string, error: any): void {
        const chunk = this.chunks.get(url);
        if (chunk) {
            if (chunk.onError) {
                chunk.onError(error);
                this.chunks.delete(url);
            } else {
                chunk.error = error;
            }
        }
    }

    private getChunkLocation(url: string): { playlist: Playlist | null, chunkIndex: number } {
        for (const playlist of Array.from(this.playlists.values())) {
            const chunkIndex = playlist.getChunkIndex(url);
            if (chunkIndex >= 0) {
                return { playlist: playlist, chunkIndex: chunkIndex };
            }
        }

        return { playlist: null, chunkIndex: -1 };
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

}

class Chunk {

    public url: string;
    public data: ArrayBuffer;
    public error: any;
    public onSuccess: Function;
    public onError: Function;

    public constructor(url: string, onSuccess?: Function, onError?: Function) {
        this.url = url;

        if (onSuccess) {
            this.onSuccess = onSuccess;
        }

        if (onError) {
            this.onError = onError;
        }
    }

}
