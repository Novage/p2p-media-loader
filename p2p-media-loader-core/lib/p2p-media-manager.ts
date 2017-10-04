import {EventEmitter} from "events";
import {createHash} from "crypto";
import {SegmentCacheManager} from "./segment-cache-manager";
import {LoaderEvents} from "./loader-interface";
import {MediaPeer, MediaPeerEvents} from "./media-peer";
import * as Debug from "debug";
import SegmentInternal from "./segment-internal";
const Client = require("bittorrent-tracker");

class PeerSegmentRequest {

    constructor(readonly peerId: string, readonly segmentUrl: string) {
    }

}

export enum P2PMediaManagerEvents {
    ForceProcessing = "force_processing"
}

export class P2PMediaManager extends EventEmitter {

    private cacheManager: SegmentCacheManager;

    private client: any;
    private announce: string[];
    private peers: Map<string, MediaPeer> = new Map();
    private peerSegmentRequests: Map<string, PeerSegmentRequest> = new Map();
    private swarmId: string;
    private peerId: string;
    private debug = Debug("p2pml:p2p-media-manager");

    public constructor(cacheManager: SegmentCacheManager, announce: string[]) {
        super();

        this.announce = announce;

        this.cacheManager = cacheManager;

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
        if (this.announce && this.announce.length > 0) {
            const clientOptions = {
                infoHash: infoHash,
                peerId: this.peerId,
                announce: this.announce
            };

            this.client = new Client(clientOptions);
            this.client.on("error", (error: any) => this.debug("client error", error));
            this.client.on("warning", (error: any) => this.debug("client warning", error));
            this.client.on("update", (data: any) => this.debug("client announce update", data));
            this.client.on("peer", this.onClientPeer.bind(this));

            this.client.start();
        }
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

    private onPieceBytesLoaded(method: string, size: number, timestamp: number): void {
        this.emit(LoaderEvents.PieceBytesLoaded, method, size, timestamp);
    }

    public sendSegmentsMapToAll(segmentsMap: string[][]): void {
        this.peers.forEach((peer) => peer.sendSegmentsMap(segmentsMap));
    }

    public sendSegmentsMap(peerId: string, segmentsMap: string[][]): void {
        const peer = this.peers.get(peerId);
        if (peer != undefined) {
            peer.sendSegmentsMap(segmentsMap);
        }
    }

    private onPeerConnect(mediaPeer: MediaPeer): void {
        this.emit(MediaPeerEvents.Connect, {id: mediaPeer.id, remoteAddress: mediaPeer.remoteAddress});
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
            this.emit(P2PMediaManagerEvents.ForceProcessing);
        }

        this.emit(MediaPeerEvents.Close, mediaPeer.id);
    }

    private onPeerError(mediaPeer: MediaPeer, error: any): void {
        this.debug("onPeerError", mediaPeer, error);
    }

    private onPeerDataSegmentsMap(): void {
        this.emit(P2PMediaManagerEvents.ForceProcessing);
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
        this.emit(P2PMediaManagerEvents.ForceProcessing);
    }

}
