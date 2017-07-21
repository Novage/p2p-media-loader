import MediaManagerInterface from "./media-manager-interface";
import LoaderFile from "./loader-file";
import {EventEmitter} from "events";
import {createHash} from "crypto";
import LoaderFileCacheManagerInterface from "./loader-file-cache-manger-interface";
import PeerCommands from "./peer-commands";
import CacheEvents from "./cache-events";
const Client = require("bittorrent-tracker");

class MediaPeer  {

    public id: string;
    public peer: any;
    public files: Set<string> = new Set();

    constructor(peer: any) {
        this.peer = peer;
        this.id = peer.id;
    }

    public sendFilesMap(files: Array<string>): void {
        if (this.peer.connected) {
            this.peer.send(JSON.stringify({"command": PeerCommands.FilesMap, "files": files}));
        } else {
            console.warn("peer is not connected");
        }
    }

}

export default class P2PMediaManager extends EventEmitter implements MediaManagerInterface {

    private cacheManager: LoaderFileCacheManagerInterface;

    private clients: Map<string, any> = new Map();
    private readonly announce = [ "wss://tracker.btorrent.xyz/" ];
    private peers: Map<string, MediaPeer> = new Map();
    private playlistUrl: string;
    private peerId: string;

    public constructor(cacheManager: LoaderFileCacheManagerInterface) {
        super();

        this.cacheManager = cacheManager;
        cacheManager.on(CacheEvents.CacheUpdated, this.onCacheUpdated.bind(this));

        const current_date = (new Date()).valueOf().toString();
        const random = Math.random().toString();
        this.peerId = createHash("sha1").update(current_date + random).digest("hex");

        console.info("client peerId", this.peerId);
    }

    public setPlaylistUrl(url: string): void {
        if (this.playlistUrl !== url) {
            this.playlistUrl = url;
            this.tryStopClients();
            this.addClient(createHash("sha1").update(url).digest("hex"));
        }
    }

    /**
     * Try stop previous clients if not leeching.
     */
    private tryStopClients(): void {
        // TODO: implement
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
            client.on("peer", this.onPeerRecieved.bind(this));

            client.start();

            this.clients.set(infoHash, client);

            /*setTimeout(() => {
                console.log("peers count", this.peers.size);
                this.peers.forEach((mediaPeer) => {
                    if (mediaPeer.peer.connected) {
                        //mediaPeer.peer.send({commange: "what_do_you_have?"});
                        console.log("peer files: ", mediaPeer.files);
                    } else {
                        console.warn("peer is not connected");
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

    private onCacheUpdated(): void {
        this.peers.forEach((mediaPeer) => mediaPeer.sendFilesMap(this.cacheManager.keys()));
    }

    private onPeerConnect(mediaPeer: MediaPeer): void {
        mediaPeer.sendFilesMap(this.cacheManager.keys());
    }

    private onPeerClose(mediaPeer: MediaPeer): void {
        this.peers.delete(mediaPeer.id);
    }

    private onPeerData(mediaPeer: MediaPeer, data: any): void {
        const dataString = new TextDecoder("utf-8").decode(data);
        const dataObject = JSON.parse(dataString);

        switch (dataObject.command) {

            case PeerCommands.FilesMap:
                console.warn(PeerCommands.FilesMap, dataObject, mediaPeer.id);
                mediaPeer.files = dataObject.files;
                break;

            default:
                console.warn("unknown peer command");
        }
    }

    private onPeerError(mediaPeer: MediaPeer, error: any): void {
        console.error("error", error);
    }

    private onPeerRecieved(peer: any) {
        console.log("onPeer", peer.id);
        if (!this.peers.has(peer.id)) {

            const mediaPeer = new MediaPeer(peer);
            mediaPeer.peer.once("connect", () => this.onPeerConnect(mediaPeer));
            mediaPeer.peer.once("close", () => this.onPeerClose(mediaPeer));
            mediaPeer.peer.on("data", (data: any) => this.onPeerData(mediaPeer, data));
            mediaPeer.peer.on("error", (error: any) => this.onPeerError(mediaPeer, error));

            this.peers.set(peer.id, mediaPeer);
        } else {
            console.log("peer exists");
        }
    }

    private collectGarbage(): void {
         // TODO: stop inactive clients
    }

}
