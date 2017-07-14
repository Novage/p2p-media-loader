//import {EventEmitter} from "events";

import ChunkManagerInterface from "./chunk-manager-interface";
import LoaderInterface from "./loader-interface";
import LoaderFile from "./loader-file";
import Utils from "./utils";

const m3u8Parser = require("m3u8-parser");

export default class ChunkManager /*extends EventEmitter*/ implements ChunkManagerInterface {

    private loader: LoaderInterface;
    private playlists: Map<string, Playlist> = new Map();

    public constructor(loader: LoaderInterface) {
        //super();
        this.loader = loader;
        this.loader.on("file_loaded", this.onFileLoaded);
    }

    public processHlsPlaylist(url: string, content: string) {
        const playlist = new Playlist(url);
        this.playlists.set(url, playlist);
        const parser = new m3u8Parser.Parser();
        parser.push(content);
        parser.end();
        playlist.manifest = parser.manifest;
    }

    public async loadHlsPlaylist(url: string) {
        console.log("onHlsPlaylist", url);

        const existingPlaylist = this.playlists.get(url);
        if (existingPlaylist && !existingPlaylist.manifest) {
            console.warn("Playlist is still loading");
            return;
        }

        try {
            const content = await Utils.loadFile(url);
            this.processHlsPlaylist(url, content);
            return content;
        } catch (e) {
            this.playlists.delete(url);
            throw e;
        }
    }

    public loadChunk(name: string): void {
        console.log("onChunk", name);
        //this.loader.load(name, {...callbacks});
    }

    private onFileLoaded(file: LoaderFile): void {
        console.log("onFileLoaded", file);
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
