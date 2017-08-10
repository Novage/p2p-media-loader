import MediaManagerInterface from "./media-manager-interface";
import LoaderFile from "./loader-file";
import {EventEmitter} from "events";
import {createHash} from "crypto";
import LoaderFileCacheManagerInterface from "./loader-file-cache-manger-interface";
import CacheEvents from "./cache-events";
import LoaderEvents from "./loader-events";
import MediaPeer from "./media-peer";
import MediaPeerEvents from "./media-peer-events";
const Client = require("bittorrent-tracker");

export default class P2PMediaManager extends EventEmitter implements MediaManagerInterface {

    private cacheManager: LoaderFileCacheManagerInterface;

    private client: any;
    private readonly announce = [ "wss://tracker.btorrent.xyz/" ];
    private peers: Map<string, MediaPeer> = new Map();
    private peerFileRequests: Map<string, string> = new Map();
    private swarmId: string;
    private peerId: string;

    public constructor(cacheManager: LoaderFileCacheManagerInterface) {
        super();

        this.cacheManager = cacheManager;
        cacheManager.on(CacheEvents.CacheUpdated, this.onCacheUpdated.bind(this));

        const date = (new Date()).valueOf().toString();
        const random = Math.random().toString();
        this.peerId = createHash("sha1").update(date + random).digest("hex");

        //console.info("client peerId", this.peerId);
    }

    public setSwarmId(id: string): void {
        if (this.swarmId !== id) {
            this.swarmId = id;
            //console.log("this.swarmId", this.swarmId);

            if (this.client) {
                this.client.stop();
            }
            this.createClient(createHash("sha1").update(id).digest("hex"));
        }
    }

    private createClient(infoHash: string): void {
        const clientOptions = {
            infoHash: infoHash,
            peerId: this.peerId,
            announce: this.announce,
        };

        this.client = new Client(clientOptions);
        this.client.on("error", (error: any) => console.error("client error", error));
        this.client.on("warning", (error: any) => console.warn("client warning", error));
        //this.client.on("update", (data: any) => console.log("client announce update"));
        this.client.on("peer", this.onClientPeer.bind(this));
        this.client.start();
    }

    private onClientPeer(peer: any) {
        //console.log("onPeer", peer.id);
        if (!this.peers.has(peer.id)) {

            const mediaPeer = new MediaPeer(peer);

            mediaPeer.on(MediaPeerEvents.Connect, this.onPeerConnect.bind(this));
            mediaPeer.on(MediaPeerEvents.Close, this.onPeerClose.bind(this));
            mediaPeer.on(MediaPeerEvents.Error, this.onPeerError.bind(this));
            mediaPeer.on(MediaPeerEvents.DataFilesMap, this.onPeerDataFilesMap.bind(this));
            mediaPeer.on(MediaPeerEvents.DataFileRequest, this.onPeerDataFileRequest.bind(this));
            mediaPeer.on(MediaPeerEvents.DataFileLoaded, this.onPeerDataFileLoaded.bind(this));
            mediaPeer.on(MediaPeerEvents.DataFileAbsent, this.onPeerDataFileAbsent.bind(this));

            this.peers.set(peer.id, mediaPeer);
        } else {
            //console.log("peer exists");
        }
    }

    public download(file: LoaderFile): void {
        if (this.isDownloading(file)) {
            return;
        }

        const mediaPeer = Array.from(this.peers.values()).find((mediaPeer: MediaPeer) => {
            return mediaPeer.hasFile(file.url) && mediaPeer.sendFileRequest(file.url);
        });

        if (mediaPeer) {
            this.peerFileRequests.set(file.url, mediaPeer.id);
        }
    }

    public abort(file: LoaderFile): void {
        const requestPeerId = this.peerFileRequests.get(file.url);
        if (requestPeerId) {
            const mediaPeer = this.peers.get(requestPeerId);
            if (mediaPeer) {
                mediaPeer.sendCancelFileRequest(file.url);
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
        mediaPeer.sendFilesMap(this.cacheManager.keys());
        this.emit(MediaPeerEvents.Connect, mediaPeer);
    }

    private onPeerClose(mediaPeer: MediaPeer): void {
        let isUpdated = false;
        this.peerFileRequests.forEach((value, key) => {
            if (value === mediaPeer.id) {
                this.peerFileRequests.delete(key);
                isUpdated = true;
            }
        });

        this.peers.delete(mediaPeer.id);

        if (isUpdated) {
            this.emit(LoaderEvents.ForceProcessing);
        }

        this.emit(MediaPeerEvents.Close, mediaPeer);
    }

    private onPeerError(mediaPeer: MediaPeer, error: any): void {
        //console.warn("onPeerError", mediaPeer, error);
    }

    private onPeerDataFilesMap(): void {
        this.emit(LoaderEvents.ForceProcessing);
    }

    private onPeerDataFileRequest(mediaPeer: MediaPeer, url: string): void {
        const file = this.cacheManager.get(url);
        if (file) {
            mediaPeer.sendFileData(file);
        } else {
            mediaPeer.sendFileAbsent(url);
        }
    }

    private onPeerDataFileLoaded(mediaPeer: MediaPeer, file: LoaderFile): void {
        //console.log("file loaded via p2p", file.url);
        this.peerFileRequests.delete(file.url);
        this.emit(LoaderEvents.FileLoaded, file);
    }

    private onPeerDataFileAbsent(mediaPeer: MediaPeer, url: string): void {
        this.peerFileRequests.delete(url);
        this.emit(LoaderEvents.ForceProcessing);
    }

}
