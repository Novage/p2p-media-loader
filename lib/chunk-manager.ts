import ChunkManagerInterface from "./chunk-manager-interface";
import LoaderInterface from "./loader-interface";

const m3u8Parser = require("m3u8-parser");

export default class ChunkManager implements ChunkManagerInterface {

    private loader: LoaderInterface;
    private playlists: Map<string, Playlist> = new Map();

    public constructor(loader: LoaderInterface) {
        this.loader = loader;
    }

    public onHlsPlaylist(url: string): void {
        console.log("onHlsPlaylist", url);

        if (this.playlists.has(url) && !this.playlists.get(url)!.manifest) {
            console.warn("Playlist is still loading");
            return;
        }

        this.playlists.set(url, new Playlist(url));

        const request = new XMLHttpRequest();
        request.open("GET", url);

        request.addEventListener("load", (response: any) => {
            if (response.target.status === 200) {
                const content = response.target.response;
                const parser = new m3u8Parser.Parser();
                parser.push(content);
                parser.end();
                this.playlists.get(url)!.manifest = parser.manifest;
                console.log("manifest", parser.manifest);
                // todo: emit success(content)
            } else {
                this.playlists.delete(url);
                console.warn("Playlist loading failed", response);
                // todo: emit error(response)
            }
        });

        request.addEventListener("error", (event: any) => {
            this.playlists.delete(url);
            console.warn("Playlist loading failed", event);
            // todo: emit error(event)
        });

        request.send();
    }

    public onChunk(name: string): void {
        console.log("onChunk", name);
        //this.loader.load(name, {...callbacks});
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
