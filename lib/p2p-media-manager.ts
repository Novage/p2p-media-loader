import MediaManagerInterface from "./media-manager-interface";
import LoaderFile from "./loader-file";
import {EventEmitter} from "events";
import {createHash} from "crypto";
const Client = require("bittorrent-tracker");

class MediaPeer  {

    files: Set<string> = new Set();
    peer: any;

    constructor(peer: any) {

        this.peer = peer;

    }

}

export default class P2PMediaManager extends EventEmitter implements MediaManagerInterface {

    private clients: Map<string, any> = new Map();
    private readonly announce = [ "wss://tracker.btorrent.xyz/" ];
    private peers: Map<string, MediaPeer> = new Map();
    private files: Set<string> = new Set();
    private playlistUrl: string;
    private peerId: string;

    public constructor() {
        super();

        const current_date = (new Date()).valueOf().toString();
        const random = Math.random().toString();
        this.peerId = createHash("sha1").update(current_date + random).digest("hex");

        this.files.add("123");
        this.files.add("345");
        this.files.add("678");

        console.warn("peer", this.peerId);
    }

    public setPlaylistUrl(url: string): void {
        if (this.playlistUrl !== url) {
            this.playlistUrl = url ;
            this.addClient(createHash("sha1").update(url).digest("hex"));
        }
    }

    private addClient(infoHash: string): void {
        if (!this.clients.has(infoHash)) {
            const clientOptions = {
                infoHash: infoHash,
                peerId: this.peerId,
                announce: this.announce,
            };

            const client = new Client(clientOptions);

            client.on("error", (error: any) => console.error("client error", error));
            client.on("warning", (error: any) => console.warn("client warning", error));
            client.on("update", (data: any) => console.log("client announce update"));
            client.on("peer", this.onPeer.bind(this));

            client.start();

            this.clients.set(infoHash, client);

            /*setTimeout(() => {
                console.log("inquiring peers");
                this.peers.forEach((mediaPeer) => {
                    if (mediaPeer.peer.connected) {
                        mediaPeer.peer.send({commange: "what_do_you_have?"});
                    } else {
                        console.warn("peer is not connected, can't send data");
                    }
                });

            }, 20000);*/
        }
    }

    public download(file: LoaderFile): void {
    }

    public abort(file: LoaderFile): void {
    }

    public isDownloading(file: LoaderFile): boolean {
        return false;
    }

    public getActiveDownloadsCount(): number {
        return 0;
    }

    private onPeer(peer: any) {
        console.log("onPeer", peer.id);
        if (!this.peers.has(peer.id)) {

            peer.once("connect", () => {
                peer.send(JSON.stringify({"files": Array.from(this.files), "from": this.peerId}));
            });

            peer.once("close", () => {
                console.warn("peer disconnected", peer.id);
                this.peers.delete(peer.id);
            });

            peer.on("data", function (data: any) {
                const dataString = new TextDecoder("utf-8").decode(data);
                const dataObject = JSON.parse(dataString);
                console.warn("data recieved ", dataObject);
            });

            peer.on("error", function (error: any) {
                console.error("error", error);
            });

            this.peers.set(peer.id, new MediaPeer(peer));
        }
    }

    private collectGarbage(): void {
         // TODO: stop inactive clients
    }

}
