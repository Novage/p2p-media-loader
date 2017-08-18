import MediaManagerInterface from "./media-manager-interface";
import LoaderFile from "./loader-file";
import {EventEmitter} from "events";
import {createHash} from "crypto";
import LoaderFileCacheManagerInterface from "./loader-file-cache-manger-interface";
import CacheEvents from "./cache-events";
import LoaderEvents from "./loader-events";
import MediaPeer from "./media-peer";
import MediaPeerEvents from "./media-peer-events";
import * as Debug from "debug";
const Client = require("bittorrent-tracker");

export default class P2PMediaManager extends EventEmitter implements MediaManagerInterface {

    private cacheManager: LoaderFileCacheManagerInterface;

    private client: any;
    private readonly announce = [ "wss://tracker.btorrent.xyz/" ];
    private peers: Map<string, MediaPeer> = new Map();
    private peerFileRequests: Map<string, string> = new Map();
    private swarmId: string;
    private peerId: string;
    private debug = Debug("p2ml:p2p-media-manager");

    public constructor(cacheManager: LoaderFileCacheManagerInterface) {
        super();

        this.cacheManager = cacheManager;
        cacheManager.on(CacheEvents.CacheUpdated, this.onCacheUpdated.bind(this));

        const date = (new Date()).valueOf().toString();
        const random = Math.random().toString();
        this.peerId = createHash("sha1").update(date + random).digest("hex");

        this.debug("peerId", this.peerId);
    }

    public setSwarmId(id: string): void {
        if (this.swarmId !== id) {
            this.swarmId = id;
            this.debug("swarm", this.swarmId);

            if (this.client) {
                this.client.stop();
                this.client.destroy();
                this.peers.forEach((mediaPeer) => mediaPeer.destroy());
                this.peers.clear();
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
        this.client.on("error", (error: any) => this.debug("client error", error));
        this.client.on("warning", (error: any) => this.debug("client warning", error));
        this.client.on("update", (data: any) => this.debug("client announce update", data));
        this.client.on("peer", this.onClientPeer.bind(this));
        this.client.start();
    }

    private onClientPeer(peer: any) {
        if (!this.peers.has(peer.id)) {

            const mediaPeer = new MediaPeer(peer);

            mediaPeer.on(MediaPeerEvents.Connect, this.onPeerConnect.bind(this));
            mediaPeer.on(MediaPeerEvents.Close, this.onPeerClose.bind(this));
            mediaPeer.on(MediaPeerEvents.Error, this.onPeerError.bind(this));
            mediaPeer.on(MediaPeerEvents.DataFilesMap, this.onPeerDataFilesMap.bind(this));
            mediaPeer.on(MediaPeerEvents.DataFileRequest, this.onPeerDataFileRequest.bind(this));
            mediaPeer.on(MediaPeerEvents.DataFileLoaded, this.onPeerDataFileLoaded.bind(this));
            mediaPeer.on(MediaPeerEvents.DataFileAbsent, this.onPeerDataFileAbsent.bind(this));
            mediaPeer.on(LoaderEvents.ChunkBytesLoaded, this.onChunkBytesLoaded.bind(this));

            this.peers.set(peer.id, mediaPeer);
        } else {
            //this.debug("peer exists");
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
            this.debug("p2p file download", file.url);
            this.peerFileRequests.set(file.url, mediaPeer.id);
        } else {
            this.debug("p2p file not found", file.url);
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
            this.debug("p2p file abort", file.url);
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

    private onChunkBytesLoaded(data: any): void {
        this.emit(LoaderEvents.ChunkBytesLoaded, data);
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
        this.debug("onPeerError", mediaPeer, error);
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
        this.peerFileRequests.delete(file.url);
        this.emit(LoaderEvents.FileLoaded, file);
    }

    private onPeerDataFileAbsent(mediaPeer: MediaPeer, url: string): void {
        this.peerFileRequests.delete(url);
        this.emit(LoaderEvents.ForceProcessing);
    }

}
