import MediaManagerInterface from "./media-manager-interface";
import Segment from "./segment";
import {EventEmitter} from "events";
import {createHash} from "crypto";
import SegmentCacheManagerInterface from "./segment-cache-manger-interface";
import CacheEvents from "./cache-events";
import LoaderEvents from "./loader-events";
import MediaPeer from "./media-peer";
import MediaPeerEvents from "./media-peer-events";
import * as Debug from "debug";
const Client = require("bittorrent-tracker");

export default class P2PMediaManager extends EventEmitter implements MediaManagerInterface {

    private cacheManager: SegmentCacheManagerInterface;

    private client: any;
    private readonly announce = [ "wss://tracker.btorrent.xyz/" ];
    private peers: Map<string, MediaPeer> = new Map();
    private peerSegmentRequests: Map<string, string> = new Map();
    private swarmId: string;
    private peerId: string;
    private debug = Debug("p2pml:p2p-media-manager");

    public constructor(cacheManager: SegmentCacheManagerInterface) {
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
            mediaPeer.on(MediaPeerEvents.DataSegmentsMap, this.onPeerDataSegmentsMap.bind(this));
            mediaPeer.on(MediaPeerEvents.DataSegmentRequest, this.onPeerDataSegmentRequest.bind(this));
            mediaPeer.on(MediaPeerEvents.DataSegmentLoaded, this.onPeerDataSegmentLoaded.bind(this));
            mediaPeer.on(MediaPeerEvents.DataSegmentAbsent, this.onPeerDataSegmentAbsent.bind(this));
            mediaPeer.on(LoaderEvents.PieceBytesLoaded, this.onPieceBytesLoaded.bind(this));

            this.peers.set(peer.id, mediaPeer);
        } else {
            //this.debug("peer exists");
        }
    }

    public download(segment: Segment): void {
        if (this.isDownloading(segment)) {
            return;
        }

        const mediaPeer = Array.from(this.peers.values()).find((mediaPeer: MediaPeer) => {
            return mediaPeer.hasSegment(segment.url) && mediaPeer.sendSegmentRequest(segment.url);
        });

        if (mediaPeer) {
            this.debug("p2p segment download", segment.url);
            this.peerSegmentRequests.set(segment.url, mediaPeer.id);
        } else {
            //this.debug("p2p segment not found", segment.url);
        }
    }

    public abort(segment: Segment): void {
        const requestPeerId = this.peerSegmentRequests.get(segment.url);
        if (requestPeerId) {
            const mediaPeer = this.peers.get(requestPeerId);
            if (mediaPeer) {
                mediaPeer.sendCancelSegmentRequest(segment.url);
            }
            this.peerSegmentRequests.delete(segment.url);
            this.debug("p2p segment abort", segment.url);
        }
    }

    public isDownloading(segment: Segment): boolean {
        return this.peerSegmentRequests.has(segment.url);
    }

    public getActiveDownloadsCount(): number {
        return this.peerSegmentRequests.size;
    }

    private onCacheUpdated(): void {
        this.peers.forEach((mediaPeer) => mediaPeer.sendSegmentsMap(this.cacheManager.keys()));
    }

    private onPieceBytesLoaded(data: any): void {
        this.emit(LoaderEvents.PieceBytesLoaded, data);
    }

    private onPeerConnect(mediaPeer: MediaPeer): void {
        mediaPeer.sendSegmentsMap(this.cacheManager.keys());
        this.emit(MediaPeerEvents.Connect, mediaPeer);
    }

    private onPeerClose(mediaPeer: MediaPeer): void {
        let isUpdated = false;
        this.peerSegmentRequests.forEach((value, key) => {
            if (value === mediaPeer.id) {
                this.peerSegmentRequests.delete(key);
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

    private onPeerDataSegmentsMap(): void {
        this.emit(LoaderEvents.ForceProcessing);
    }

    private onPeerDataSegmentRequest(mediaPeer: MediaPeer, url: string): void {
        const segment = this.cacheManager.get(url);
        if (segment) {
            mediaPeer.sendSegmentData(segment);
        } else {
            mediaPeer.sendSegmentAbsent(url);
        }
    }

    private onPeerDataSegmentLoaded(mediaPeer: MediaPeer, segment: Segment): void {
        this.peerSegmentRequests.delete(segment.url);
        this.emit(LoaderEvents.SegmentLoaded, segment);
    }

    private onPeerDataSegmentAbsent(mediaPeer: MediaPeer, url: string): void {
        this.peerSegmentRequests.delete(url);
        this.emit(LoaderEvents.ForceProcessing);
    }

}
