import {EventEmitter} from "events";

import ChunkManagerInterface from "./chunk-manager-interface";
import LoaderInterface from "./loader-interface";
import LoaderFile from "./loader-file";
import Utils from "./utils";

const m3u8Parser = require("m3u8-parser");

export default class ChunkManager extends EventEmitter implements ChunkManagerInterface {

    private loader: LoaderInterface;
    private playlists: Map<string, Playlist> = new Map();
    private loadedFiles: Map<string, LoaderFile> = new Map();

    public constructor(loader: LoaderInterface) {
        super();
        this.loader = loader;
        this.loader.on("file_loaded", this.onFileLoaded.bind(this));
        this.loader.on("file_error", this.onFileError.bind(this));
    }

    public processHlsPlaylist(url: string, content: string): void {
        const playlist = new Playlist(url);
        this.playlists.set(url, playlist);
        const parser = new m3u8Parser.Parser();
        parser.push(content);
        parser.end();
        playlist.manifest = parser.manifest;
    }

    public async loadHlsPlaylist(url: string): Promise<string> {
        const existingPlaylist = this.playlists.get(url);
        if (existingPlaylist && !existingPlaylist.manifest) {
            throw "Playlist is still loading";
        }

        try {
            const content = await Utils.fetchContent(url);
            this.processHlsPlaylist(url, content);
            return content;
        } catch (e) {
            this.playlists.delete(url);
            throw e;
        }
    }

    public loadChunk(url: string): void {
        const existingFile = this.loadedFiles.get(url);
        if (existingFile) {
            this.emitChunkLoadSuccess(existingFile);
            return;
        }

        for (const playlist of Array.from(this.playlists.values())) {
            if (!playlist.manifest) {
                return;
            }

            const chunks: any[] = playlist.manifest.segments;
            for (let i = 0; i < chunks.length; ++i) {
                if (!url.endsWith(chunks[ i ].uri)) {
                    continue;
                }

                const files: LoaderFile[] = [];
                for (let j = i; j < chunks.length; ++j) {
                    const url = playlist.baseUrl + chunks[ j ].uri;
                    files.push(new LoaderFile(url));
                }

                this.loader.load(files);
                return;
            }
        }
    }

    public abortChunk(url: string): void {
        console.log("abortChunk", url);
    }

    private onFileLoaded(file: LoaderFile): void {
        this.loadedFiles.set(file.url, file);
        this.emitChunkLoadSuccess(file);
    }

    private onFileError(url: string, error: any): void {
        this.emit("chunk_load_error", url, error);
    }

    private emitChunkLoadSuccess(file: LoaderFile): void {
        this.emit("chunk_load_success", file.url, file.data);
    }

    private emitChunkLoadError(url: string, error: any): void {
        this.emit("chunk_load_error", url, error);
    }

}

class Playlist {

    public url: string;
    public baseUrl: string;
    public manifest: any;

    public constructor(url: string) {
        this.url = url;

        const pos = url.lastIndexOf("/");
        if (pos === -1) {
            throw "Unexpected playlist URL format";
        }

        this.baseUrl = url.substring(0, pos + 1);
    }

}
