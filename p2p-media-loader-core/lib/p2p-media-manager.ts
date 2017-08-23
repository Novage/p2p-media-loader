import MediaManagerInterface from "./media-manager-interface";
import {EventEmitter} from "events";
import {createHash} from "crypto";
import SegmentCacheManagerInterface from "./segment-cache-manger-interface";
import CacheEvents from "./cache-events";
import LoaderEvents from "./loader-events";
import MediaPeer from "./media-peer";
import MediaPeerEvents from "./media-peer-events";
import * as Debug from "debug";
import SegmentInternal from "./segment-internal";
const Client = require("bittorrent-tracker");

class PeerSegmentRequest {

    constructor(readonly peerId: string, readonly segmentUrl: string) {
    }

}

export default class P2PMediaManager extends EventEmitter implements MediaManagerInterface {

    private cacheManager: SegmentCacheManagerInterface;

    private client: any;
    private announce: string[];
    private peers: Map<string, MediaPeer> = new Map();
    private peerSegmentRequests: Map<string, PeerSegmentRequest> = new Map();
    private swarmId: string;
    private peerId: string;
    private debug = Debug("p2pml:p2p-media-manager");

    public constructor(cacheManager: SegmentCacheManagerInterface, announce: string[]) {
        super();

        this.announce = announce;

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
            }
            this.peers.forEach((mediaPeer) => mediaPeer.destroy());
            this.peers.clear();
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

    public download(segment: SegmentInternal): void {
        if (this.isDownloading(segment)) {
            return;
        }

        const mediaPeer = Array.from(this.peers.values()).find((mediaPeer: MediaPeer) => {
            return mediaPeer.hasSegment(segment.id) && mediaPeer.sendSegmentRequest(segment.id);
        });

        if (mediaPeer) {
            this.debug("p2p segment download", segment.id, segment.url);
            this.peerSegmentRequests.set(segment.id, new PeerSegmentRequest(mediaPeer.id, segment.url));
        } else {
            //this.debug("p2p segment not found", segment.id);
        }
    }

    public abort(segment: SegmentInternal): void {
        const peerSegmentRequest = this.peerSegmentRequests.get(segment.id);
        if (peerSegmentRequest) {
            const mediaPeer = this.peers.get(peerSegmentRequest.peerId);
            if (mediaPeer) {
                mediaPeer.sendCancelSegmentRequest(segment.id);
            }
            this.peerSegmentRequests.delete(segment.id);
            this.debug("p2p segment abort", segment.id, segment.url);
        }
    }

    public isDownloading(segment: SegmentInternal): boolean {
        return this.peerSegmentRequests.has(segment.id);
    }

    public getActiveDownloadsCount(): number {
        return this.peerSegmentRequests.size;
    }

    public destroy(): void {
        if (this.client) {
            this.client.stop();
            this.client.destroy();
        }
        this.peers.forEach((mediaPeer) => mediaPeer.destroy());
        this.peers.clear();
        this.peerSegmentRequests.clear();
    }

    private onCacheUpdated(): void {
        this.peers.forEach((mediaPeer) => mediaPeer.sendSegmentsMap(this.cacheManager.keys()));
    }

    private onPieceBytesLoaded(method: string, size: number, timestamp: number): void {
        this.emit(LoaderEvents.PieceBytesLoaded, method, size, timestamp);
    }

    private onPeerConnect(mediaPeer: MediaPeer): void {
        mediaPeer.sendSegmentsMap(this.cacheManager.keys());
        this.emit(MediaPeerEvents.Connect, mediaPeer);
    }

    private onPeerClose(mediaPeer: MediaPeer): void {
        let isUpdated = false;
        this.peerSegmentRequests.forEach((value, key) => {
            if (value.peerId === mediaPeer.id) {
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

    private onPeerDataSegmentRequest(mediaPeer: MediaPeer, id: string): void {
        const segment = this.cacheManager.get(id);
        if (segment) {
            mediaPeer.sendSegmentData(segment);
        } else {
            mediaPeer.sendSegmentAbsent(id);
        }
    }

    private onPeerDataSegmentLoaded(mediaPeer: MediaPeer, id: string, data: ArrayBuffer): void {
        const peerSegmentRequest = this.peerSegmentRequests.get(id);
        if (peerSegmentRequest) {
            this.peerSegmentRequests.delete(id);
            this.emit(LoaderEvents.SegmentLoaded, id, peerSegmentRequest.segmentUrl, data);
            this.debug("p2p segment loaded", peerSegmentRequest.segmentUrl);
        }
    }

    private onPeerDataSegmentAbsent(mediaPeer: MediaPeer, id: string): void {
        this.peerSegmentRequests.delete(id);
        this.emit(LoaderEvents.ForceProcessing);
    }

}
