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
        this.sendCommand({"command": PeerCommands.FilesMap, "files": files});
    }

    public sendFileData(file: LoaderFile): void {
        const xxx = new TextDecoder("utf-8").decode(file.data.slice(0));
        const yyy = xxx.slice(0, Math.floor(xxx.length / 10000));
        console.log("sendFileData", xxx.length, yyy.length);
        this.sendCommand({"command": PeerCommands.FileData, "data": yyy});
    }

    public sendFileAbsent(url: string): void {
        this.sendCommand({"command": PeerCommands.FileAbsent, "url": url});
    }

    public sendFileRequest(url: string): boolean {
        return this.sendCommand({"command": PeerCommands.FileRequest, "url": url});
    }

    public sendCancelFileRequest(): boolean {
        return this.sendCommand({"command": PeerCommands.CancelFileRequest});
    }

    private sendCommand(command: any): boolean {
        try {
            if (this.peer.connected) {
                this.peer.send(JSON.stringify(command));
                return true;
            } else {
                console.warn("peer is not connected");
            }
        } catch (error) {
            console.info("sendCommand failed", error, command);
        }

        return false;
    }

}

export default class P2PMediaManager extends EventEmitter implements MediaManagerInterface {

    private cacheManager: LoaderFileCacheManagerInterface;

    private client: any;
    private readonly announce = [ "wss://tracker.btorrent.xyz/" ];
    private peers: Map<string, MediaPeer> = new Map();
    private peerFileRequests: Map<string, string> = new Map();
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
            console.log("this.playlistUrl", this.playlistUrl);

            if (this.client) {
                this.client.stop();
            }
            this.createClient(createHash("sha1").update(url).digest("hex"));
        }
    }

    private createClient(infoHash: string): void {
        console.log("infohash", infoHash);
        const clientOptions = {
            infoHash: infoHash,
            peerId: this.peerId,
            announce: this.announce,
        };

        this.client = new Client(clientOptions);
        this.client.on("error", (error: any) => console.error("client error", error));
        this.client.on("warning", (error: any) => console.warn("client warning", error));
        this.client.on("update", (data: any) => console.log("client announce update"));
        this.client.on("peer", this.onClientPeer.bind(this));
        this.client.start();
    }

    private onClientPeer(peer: any) {
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

    public download(file: LoaderFile): void {
        if (this.isDownloading(file)) {
            return;
        }

        const mediaPeer = Array.from(this.peers.values()).find((mediaPeer: MediaPeer) => {
            return mediaPeer.files.has(file.url) && mediaPeer.sendFileRequest(file.url);
        });

        if (mediaPeer) {
            this.peerFileRequests.set(file.url, mediaPeer.id);
            // TODO: set loading timeout
        }
    }

    public abort(file: LoaderFile): void {
        const requestPeerId = this.peerFileRequests.get(file.url);
        if (requestPeerId) {
            const mediaPeer = this.peers.get(requestPeerId);
            if (mediaPeer) {
                mediaPeer.sendCancelFileRequest();
            }
            this.peerFileRequests.delete(file.url);
        }
    }

    public isDownloading(file: LoaderFile): boolean {
        return this.peerFileRequests.has(file.url);
    }

    public getActiveDownloadsCount(): number {
        return this.peerFileRequests.size;
    }

    private onCacheUpdated(): void {
        this.peers.forEach((mediaPeer) => mediaPeer.sendFilesMap(this.cacheManager.keys()));
    }

    private onPeerConnect(mediaPeer: MediaPeer): void {
        console.log("onPeerConnect");
        mediaPeer.sendFilesMap(this.cacheManager.keys());
    }

    private onPeerClose(mediaPeer: MediaPeer): void {
        this.peers.delete(mediaPeer.id);
    }

    private onPeerData(mediaPeer: MediaPeer, data: any): void {
        const dataString = new TextDecoder("utf-8").decode(data);
        const dataObject = JSON.parse(dataString);

        console.warn(dataObject.command, dataObject, mediaPeer.id);

        switch (dataObject.command) {

            case PeerCommands.FilesMap:
                mediaPeer.files = new Set(dataObject.files);
                break;

            case PeerCommands.FileRequest:
                const file = this.cacheManager.get(dataObject.url);
                if (file) {
                    mediaPeer.sendFileData(file);
                } else {
                    mediaPeer.sendFileAbsent(dataObject.url);
                }
                break;

            case PeerCommands.FileData:
                const xxx = new TextEncoder("utf-8").encode(dataObject.data);
                // trigger event
                break;

            case PeerCommands.FileAbsent:
                // TODO: set IsDownloading to false by url
                // TODO: mediaPeer.files remove by url
                // trigger event
                break;

            case PeerCommands.CancelFileRequest:
                // TODO: cancel file sending
                break;

            default:
                break;
        }
    }

    private onPeerError(mediaPeer: MediaPeer, error: any): void {
        console.error("error", error);
    }

}
