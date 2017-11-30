import {EventEmitter} from "events";
import {createHash} from "crypto";
import {LoaderEvents} from "./loader-interface";
import {MediaPeer, MediaPeerEvents, MediaPeerSegmentStatus} from "./media-peer";
import * as Debug from "debug";
import SegmentInternal from "./segment-internal";
import {Client} from "bittorrent-tracker";

class PeerSegmentRequest {

    constructor(readonly peerId: string, readonly segmentUrl: string) {
    }

}

export enum P2PMediaManagerEvents {
    PeerDataUpdated = "peer_data_updated"
}

export class P2PMediaManager extends EventEmitter {

    private trackerClient: any = null;
    private peers: Map<string, MediaPeer> = new Map();
    private peerCandidates: Map<string, MediaPeer[]> = new Map();
    private peerSegmentRequests: Map<string, PeerSegmentRequest> = new Map();
    private swarmId: string;
    private peerId: string;
    private debug = Debug("p2pml:p2p-media-manager");

    public constructor(readonly segments: Map<string, SegmentInternal>,
            readonly settings: {
                useP2P: boolean,
                trackerAnnounce: string[],
                p2pSegmentDownloadTimeout: number,
                webRtcMaxMessageSize: number
            }) {
        super();

        this.segments = segments;
        this.peerId = createHash("sha1").update((Date.now() + Math.random()).toFixed(12)).digest("hex");

        this.debug("peerId", this.peerId);
    }

    public setSwarmId(id: string): void {
        if (this.swarmId == id) {
            return;
        }

        this.destroy();

        this.swarmId = id;
        this.debug("swarm", this.swarmId);
        this.createClient(createHash("sha1").update(id).digest("hex"));
    }

    private createClient(infoHash: string): void {
        if (!this.settings.useP2P) {
            return;
        }

        const clientOptions = {
            infoHash: infoHash,
            peerId: this.peerId,
            announce: this.settings.trackerAnnounce
        };

        this.trackerClient = new Client(clientOptions);
        this.trackerClient.on("error", (error: any) => this.debug("client error", error));
        this.trackerClient.on("warning", (error: any) => this.debug("client warning", error));
        this.trackerClient.on("update", (data: any) => this.debug("client announce update", data));
        this.trackerClient.on("peer", this.onClientPeer.bind(this));

        this.trackerClient.start();
    }

    private onClientPeer(trackerPeer: any): void {
        if (this.peers.has(trackerPeer.id)) {
            trackerPeer.destroy();
            return;
        }

        const peer = new MediaPeer(trackerPeer, this.settings);

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

        let peerCandidatesById = this.peerCandidates.get(peer.id);

        if (!peerCandidatesById) {
            peerCandidatesById = [];
            this.peerCandidates.set(peer.id, peerCandidatesById);
        }

        peerCandidatesById.push(peer);
    }

    public download(segment: SegmentInternal): boolean {
        if (this.isDownloading(segment)) {
            return false;
        }

        const entries = this.peers.values();
        for (let entry = entries.next(); !entry.done; entry = entries.next()) {
            const peer = entry.value;
            if ((peer.getDownloadingSegmentId() == null) &&
                    (peer.getSegmentsMap().get(segment.id) === MediaPeerSegmentStatus.Loaded) &&
                    peer.requestSegment(segment.id)) {
                this.peerSegmentRequests.set(segment.id, new PeerSegmentRequest(peer.id, segment.url));
                this.debug("p2p segment download", segment.id, segment.url);
                return true;
            }
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
            this.trackerClient = null;
        }

        this.peers.forEach((peer) => peer.destroy());
        this.peers.clear();

        this.peerSegmentRequests.clear();

        this.peerCandidates.forEach((peerCandidateById) => {
            for (const peerCandidate of peerCandidateById) {
                peerCandidate.destroy();
            }
        });
        this.peerCandidates.clear();
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
        const connectedPeer = this.peers.get(peer.id);

        // First peer with the ID connected
        if (!connectedPeer) {
            this.peers.set(peer.id, peer);

            // Destroy all other peer candidates
            const peerCandidatesById = this.peerCandidates.get(peer.id);
            if (peerCandidatesById) {
                for (const peerCandidate of peerCandidatesById) {
                    if (peerCandidate != peer) {
                        peerCandidate.destroy();
                    }
                }

                this.peerCandidates.delete(peer.id);
            }

            this.emit(MediaPeerEvents.Connect, {id: peer.id, remoteAddress: peer.remoteAddress});
        }
    }

    private onPeerClose(peer: MediaPeer): void {
        if (this.peers.get(peer.id) != peer) {
            // Try to delete the peer candidate

            const peerCandidatesById = this.peerCandidates.get(peer.id);
            if (!peerCandidatesById) {
                return;
            }

            const index = peerCandidatesById.indexOf(peer);
            if (index != -1) {
                peerCandidatesById.splice(index, 1);
            }

            if (peerCandidatesById.length == 0) {
                this.peerCandidates.delete(peer.id);
            }

            return;
        }

        this.peerSegmentRequests.forEach((value, key) => {
            if (value.peerId == peer.id) {
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
