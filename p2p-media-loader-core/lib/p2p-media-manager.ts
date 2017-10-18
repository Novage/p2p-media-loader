import {EventEmitter} from "events";
import {createHash} from "crypto";
import {LoaderEvents} from "./loader-interface";
import {MediaPeer, MediaPeerEvents, MediaPeerSegmentStatus} from "./media-peer";
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
        this.peerId = createHash("sha1").update((Date.now() + Math.random()).toFixed(12)).digest("hex");

        this.debug("peerId", this.peerId);
    }

    public setSwarmId(id: string): void {
        if (this.swarmId == id) {
            return;
        }

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

    private createClient(infoHash: string): void {
        if (!this.announce || this.announce.length == 0) {
            return;
        }

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

    private onClientPeer(trackerPeer: {id: string}): void {
        if (this.peers.has(trackerPeer.id)) {
            //this.debug("peer exists");
            return;
        }

        const peer = new MediaPeer(trackerPeer);

        peer.on(MediaPeerEvents.Connect, this.onPeerConnect.bind(this));
        peer.on(MediaPeerEvents.Close, this.onPeerClose.bind(this));
        peer.on(MediaPeerEvents.Error, this.onPeerError.bind(this));
        peer.on(MediaPeerEvents.SegmentsMap, this.onSegmentsMap.bind(this));
        peer.on(MediaPeerEvents.SegmentRequest, this.onSegmentRequest.bind(this));
        peer.on(MediaPeerEvents.SegmentLoaded, this.onSegmentLoaded.bind(this));
        peer.on(MediaPeerEvents.SegmentAbsent, this.onSegmentAbsent.bind(this));
        peer.on(MediaPeerEvents.SegmentError, this.onSegmentError.bind(this));
        peer.on(MediaPeerEvents.SegmentTimeout, this.onSegmentTimeout.bind(this));
        peer.on(LoaderEvents.PieceBytesLoaded, this.onPieceBytesLoaded.bind(this));

        this.peers.set(trackerPeer.id, peer);
    }

    public download(segment: SegmentInternal): boolean {
        if (this.isDownloading(segment)) {
            return false;
        }

        const peer = Array.from(this.peers.values()).find((peer: MediaPeer) => {
            return (peer.getDownloadingSegmentId() == null) &&
                (peer.getSegmentsMap().get(segment.id) === MediaPeerSegmentStatus.Loaded) &&
                peer.requestSegment(segment.id);
        });

        if (peer) {
            this.peerSegmentRequests.set(segment.id, new PeerSegmentRequest(peer.id, segment.url));
            this.debug("p2p segment download", segment.id, segment.url);
            return true;
        }

        return false;
    }

    public abort(segment: SegmentInternal): void {
        const peerSegmentRequest = this.peerSegmentRequests.get(segment.id);
        if (peerSegmentRequest) {
            const peer = this.peers.get(peerSegmentRequest.peerId);
            if (peer) {
                peer.cancelSegmentRequest();
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

    public sendSegmentsMapToAll(segmentsMap: string[][]): void {
        this.peers.forEach((peer) => peer.sendSegmentsMap(segmentsMap));
    }

    public sendSegmentsMap(peerId: string, segmentsMap: string[][]): void {
        const peer = this.peers.get(peerId);
        if (peer) {
            peer.sendSegmentsMap(segmentsMap);
        }
    }

    public getOvrallSegmentsMap(): Map<string, MediaPeerSegmentStatus> {
        const overallSegmentsMap: Map<string, MediaPeerSegmentStatus> = new Map();
        this.peers.forEach(peer => peer.getSegmentsMap().forEach((segmentStatus, segmentId) => {
            if (segmentStatus === MediaPeerSegmentStatus.Loaded) {
                overallSegmentsMap.set(segmentId, MediaPeerSegmentStatus.Loaded);
            } else if (!overallSegmentsMap.get(segmentId)) {
                overallSegmentsMap.set(segmentId, MediaPeerSegmentStatus.LoadingByHttp);
            }
        }));

        return overallSegmentsMap;
    }

    private onPieceBytesLoaded(method: string, size: number): void {
        this.emit(LoaderEvents.PieceBytesLoaded, method, size);
    }

    private onPeerConnect(peer: MediaPeer): void {
        this.emit(MediaPeerEvents.Connect, {id: peer.id, remoteAddress: peer.remoteAddress});
    }

    private onPeerClose(peer: MediaPeer): void {
        this.peerSegmentRequests.forEach((value, key) => {
            if (value.peerId === peer.id) {
                this.peerSegmentRequests.delete(key);
            }
        });

        this.peers.delete(peer.id);
        this.emit(P2PMediaManagerEvents.PeerDataUpdated);
        this.emit(MediaPeerEvents.Close, peer.id);
    }

    private onPeerError(peer: MediaPeer, error: any): void {
        this.debug("onPeerError", peer, error);
    }

    private onSegmentsMap(): void {
        this.emit(P2PMediaManagerEvents.PeerDataUpdated);
    }

    private onSegmentRequest(peer: MediaPeer, segmentId: string): void {
        const segment = this.segments.get(segmentId);
        if (segment) {
            peer.sendSegmentData(segmentId, segment.data!);
        } else {
            peer.sendSegmentAbsent(segmentId);
        }
    }

    private onSegmentLoaded(peer: MediaPeer, segmentId: string, data: ArrayBuffer): void {
        const peerSegmentRequest = this.peerSegmentRequests.get(segmentId);
        if (peerSegmentRequest) {
            this.peerSegmentRequests.delete(segmentId);
            this.emit(LoaderEvents.SegmentLoaded, segmentId, peerSegmentRequest.segmentUrl, data);
            this.debug("p2p segment loaded", peerSegmentRequest.segmentUrl);
        }
    }

    private onSegmentAbsent(peer: MediaPeer, segmentId: string): void {
        this.peerSegmentRequests.delete(segmentId);
        this.emit(P2PMediaManagerEvents.PeerDataUpdated);
    }

    private onSegmentError(peer: MediaPeer, segmentId: string, description: string): void {
        const peerSegmentRequest = this.peerSegmentRequests.get(segmentId);
        if (peerSegmentRequest) {
            this.peerSegmentRequests.delete(segmentId);
            this.emit(LoaderEvents.SegmentError, peerSegmentRequest.segmentUrl, description);
            this.debug("p2p segment download failed", segmentId, description);
        }
    }

    private onSegmentTimeout(peer: MediaPeer, segmentId: string): void {
        const peerSegmentRequest = this.peerSegmentRequests.get(segmentId);
        if (peerSegmentRequest) {
            this.peerSegmentRequests.delete(segmentId);
            peer.destroy();
            if (this.peers.delete(peerSegmentRequest.peerId)) {
                this.emit(P2PMediaManagerEvents.PeerDataUpdated);
            }
            this.debug("p2p segment download timeout", segmentId);
        }
    }

}
