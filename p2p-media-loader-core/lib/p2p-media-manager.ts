import {EventEmitter} from "events";
import {createHash} from "crypto";
import {LoaderEvents} from "./loader-interface";
import {MediaPeer, MediaPeerEvents} from "./media-peer";
import * as Debug from "debug";
import SegmentInternal from "./segment-internal";
const TrackerClient = require("bittorrent-tracker");

class PeerSegmentRequest {

    constructor(readonly peerId: string, readonly segmentUrl: string) {
    }

}

export enum P2PMediaManagerEvents {
    PeerDataUpdated = "peer_data_updated"
}

export class P2PMediaManager extends EventEmitter {

    private segments: Map<string, SegmentInternal>;

    private trackerClient: any;
    private announce: string[];
    private peers: Map<string, MediaPeer> = new Map();
    private peerSegmentRequests: Map<string, PeerSegmentRequest> = new Map();
    private swarmId: string;
    private peerId: string;
    private debug = Debug("p2pml:p2p-media-manager");

    public constructor(segments: Map<string, SegmentInternal>, announce: string[]) {
        super();

        this.announce = announce;

        this.segments = segments;

        const date = (new Date()).valueOf().toString();
        const random = Math.random().toString();
        this.peerId = createHash("sha1").update(date + random).digest("hex");

        this.debug("peerId", this.peerId);
    }

    public setSwarmId(id: string): void {
        if (this.swarmId !== id) {
            this.swarmId = id;
            this.debug("swarm", this.swarmId);

            if (this.trackerClient) {
                this.trackerClient.stop();
                this.trackerClient.destroy();
            }
            this.peers.forEach((peer) => peer.destroy());
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

            this.trackerClient = new TrackerClient(clientOptions);
            this.trackerClient.on("error", (error: any) => this.debug("client error", error));
            this.trackerClient.on("warning", (error: any) => this.debug("client warning", error));
            this.trackerClient.on("update", (data: any) => this.debug("client announce update", data));
            this.trackerClient.on("peer", this.onClientPeer.bind(this));

            this.trackerClient.start();
        }
    }

    private onClientPeer(trackerPeer: {id: string}) {
        if (!this.peers.has(trackerPeer.id)) {

            const peer = new MediaPeer(trackerPeer);

            peer.on(MediaPeerEvents.Connect, this.onPeerConnect.bind(this));
            peer.on(MediaPeerEvents.Close, this.onPeerClose.bind(this));
            peer.on(MediaPeerEvents.Error, this.onPeerError.bind(this));
            peer.on(MediaPeerEvents.DataSegmentsMap, this.onPeerDataSegmentsMap.bind(this));
            peer.on(MediaPeerEvents.DataSegmentRequest, this.onPeerDataSegmentRequest.bind(this));
            peer.on(MediaPeerEvents.DataSegmentLoaded, this.onPeerDataSegmentLoaded.bind(this));
            peer.on(MediaPeerEvents.DataSegmentAbsent, this.onPeerDataSegmentAbsent.bind(this));
            peer.on(LoaderEvents.PieceBytesLoaded, this.onPieceBytesLoaded.bind(this));

            this.peers.set(trackerPeer.id, peer);
        } else {
            //this.debug("peer exists");
        }
    }

    public download(segment: SegmentInternal): void {
        if (this.isDownloading(segment)) {
            return;
        }

        const peer = Array.from(this.peers.values()).find((peer: MediaPeer) => {
            return peer.hasSegment(segment.id) && peer.sendSegmentRequest(segment.id);
        });

        if (peer) {
            this.debug("p2p segment download", segment.id, segment.url);
            this.peerSegmentRequests.set(segment.id, new PeerSegmentRequest(peer.id, segment.url));
        } else {
            //this.debug("p2p segment not found", segment.id);
        }
    }

    public abort(segment: SegmentInternal): void {
        const peerSegmentRequest = this.peerSegmentRequests.get(segment.id);
        if (peerSegmentRequest) {
            const peer = this.peers.get(peerSegmentRequest.peerId);
            if (peer) {
                peer.sendCancelSegmentRequest(segment.id);
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
        if (this.trackerClient) {
            this.trackerClient.stop();
            this.trackerClient.destroy();
        }
        this.peers.forEach((peer) => peer.destroy());
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

    private onPeerConnect(peer: MediaPeer): void {
        this.emit(MediaPeerEvents.Connect, {id: peer.id, remoteAddress: peer.remoteAddress});
    }

    private onPeerClose(peer: MediaPeer): void {
        let isUpdated = false;
        this.peerSegmentRequests.forEach((value, key) => {
            if (value.peerId === peer.id) {
                this.peerSegmentRequests.delete(key);
                isUpdated = true;
            }
        });

        this.peers.delete(peer.id);

        if (isUpdated) {
            this.emit(P2PMediaManagerEvents.PeerDataUpdated);
        }

        this.emit(MediaPeerEvents.Close, peer.id);
    }

    private onPeerError(peer: MediaPeer, error: any): void {
        this.debug("onPeerError", peer, error);
    }

    private onPeerDataSegmentsMap(): void {
        this.emit(P2PMediaManagerEvents.PeerDataUpdated);
    }

    private onPeerDataSegmentRequest(peer: MediaPeer, id: string): void {
        const segment = this.segments.get(id);
        if (segment) {
            peer.sendSegmentData(segment);
        } else {
            peer.sendSegmentAbsent(id);
        }
    }

    private onPeerDataSegmentLoaded(peer: MediaPeer, id: string, data: ArrayBuffer): void {
        const peerSegmentRequest = this.peerSegmentRequests.get(id);
        if (peerSegmentRequest) {
            this.peerSegmentRequests.delete(id);
            this.emit(LoaderEvents.SegmentLoaded, id, peerSegmentRequest.segmentUrl, data);
            this.debug("p2p segment loaded", peerSegmentRequest.segmentUrl);
        }
    }

    private onPeerDataSegmentAbsent(peer: MediaPeer, id: string): void {
        this.peerSegmentRequests.delete(id);
        this.emit(P2PMediaManagerEvents.PeerDataUpdated);
    }

}
