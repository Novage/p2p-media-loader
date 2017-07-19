import MediaManagerInterface from "./media-manager-interface";
import LoaderFile from "./loader-file";
import {EventEmitter} from "events";
import {createHash} from "crypto";
const Client = require("bittorrent-tracker");

export default class P2PMediaManager extends EventEmitter implements MediaManagerInterface {

    private clients: Map<string, any> = new Map();
    private readonly announce = [ "wss://tracker.btorrent.xyz/" ];
    private peers: Map<string, any> = new Map();
    private playlistUrl: string;
    private peerId: string;

    public constructor() {
        super();
        this.peerId = this.generatePeerId();
        console.warn("peer", this.peerId);
    }

    public setPlaylistUrl(url: string): void {
        //url = url + "_mod11";
        if (this.playlistUrl !== url) {
            this.playlistUrl = url ;
            this.addClient(createHash("sha1").update(url).digest("hex"));
        }
    }

    private addClient(infoHash: string): void {
        const client = this.clients.get(infoHash);

        if (!client) {
            const clientOptions = {
                infoHash: infoHash,
                peerId: this.peerId,
                announce: this.announce,
            };

            const client = new Client(clientOptions);

            client.on("error", (error: any) => console.error("client error", error));
            client.on("warning", (error: any) => console.warn("client warning", error));
            client.on("update", (data: any) => console.log("client announce update"));
            client.on("peer", this.onPeer.bind(this)); // once?

            client.start();

            this.clients.set(infoHash, client);

            setTimeout(() => {
                console.log("inquiring peers");
                this.peers.forEach((peer) => {
                    if (peer.connected) {
                        peer.send({commange: "what_do_you_have?"});
                    }
                });

            }, 20000);
        } else {
            client.update();
        }
    }

    private generatePeerId() {
        const current_date = (new Date()).valueOf().toString();
        const random = Math.random().toString();
        return createHash("sha1").update(current_date + random).digest("hex");
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
        console.log("onPeer", peer);
        if (!this.peers.has(peer.id)) {

            peer.on("signal", function (data: any) {
                console.warn("signal", data);
            });

            peer.on("connect", function () {
                console.warn("connect");
            });

            peer.on("data", function (data: any) {
                //var message = new TextDecoder("utf-8").decode(data);
                console.warn("data recieved", data);
            });

            peer.on("stream", function () {
                console.log("stream");
            });

            peer.on("close", () => {
                console.warn("peer close");

                this.peers.delete(peer.id);
            });

            peer.on("error", function () {
                console.log("error");
            });

            this.peers.set(peer.id, peer);

        }
    }

    private collectGarbage(): void {
         // TODO: stop inactive clients
    }

}
