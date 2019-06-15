/**
 * Copyright 2018 Novage LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as Debug from "debug";

import * as Client from "bittorrent-tracker/client";
import STEEmitter from "./stringly-typed-event-emitter";
import {Segment, SegmentValidatorCallback, SegmentsStorage} from "./loader-interface";
import {MediaPeer, MediaPeerSegmentStatus} from "./media-peer";
import {Buffer} from "buffer";
import * as sha1 from "sha.js/sha1";
import {version} from "./index";

const PEER_PROTOCOL_VERSION = 2;
const PEER_ID_VERSION_STRING = version.replace(/\d*./g, v => `0${parseInt(v, 10) % 100}`.slice(-2)).slice(0, 4);
const PEER_ID_VERSION_PREFIX = `-WW${PEER_ID_VERSION_STRING}-`; // Using WebTorrent client ID in order to not be banned by websocket trackers

class PeerSegmentRequest {
    constructor(
        readonly peerId: string,
        readonly segment: Segment
    ) {}
}

function generatePeerId(): ArrayBuffer {
    const PEER_ID_SYMBOLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const PEER_ID_LENGTH = 20;

    let peerId = PEER_ID_VERSION_PREFIX;

    for (let i = 0; i < PEER_ID_LENGTH - PEER_ID_VERSION_PREFIX.length; i++) {
        peerId += PEER_ID_SYMBOLS.charAt(Math.floor(Math.random() * PEER_ID_SYMBOLS.length));
    }

    return new TextEncoder().encode(peerId).buffer;
}

export class P2PMediaManager extends STEEmitter<
    "peer-connected" | "peer-closed" | "peer-data-updated" |
    "segment-loaded" | "segment-error" | "bytes-downloaded" |
    "bytes-uploaded" | "tracker-update"
> {
    private trackerClient: any = null;
    private peers: Map<string, MediaPeer> = new Map();
    private peerCandidates: Map<string, MediaPeer[]> = new Map();
    private peerSegmentRequests: Map<string, PeerSegmentRequest> = new Map();
    private streamSwarmId: string | null = null;
    private readonly peerId: ArrayBuffer;
    private debug = Debug("p2pml:p2p-media-manager");
    private pendingTrackerClient: {
        isDestroyed: boolean
    } | null = null;
    private masterSwarmId?: string;

    public constructor(
            private sementsStorage: SegmentsStorage,
            private settings: {
                useP2P: boolean,
                trackerAnnounce: string[],
                p2pSegmentDownloadTimeout: number,
                segmentValidator?: SegmentValidatorCallback,
                webRtcMaxMessageSize: number,
                rtcConfig?: RTCConfiguration
            }) {
        super();

        this.peerId = settings.useP2P ? generatePeerId() : new ArrayBuffer(0);

        if (this.debug.enabled) {
            this.debug("peer ID", this.getPeerId(), new TextDecoder().decode(this.peerId));
        }
    }

    public getPeers() {
        return this.peers;
    }

    public getPeerId(): string {
        return Buffer.from(this.peerId).toString("hex");
    }

    public async setStreamSwarmId(streamSwarmId: string, masterSwarmId: string) {
        if (this.streamSwarmId === streamSwarmId) {
            return;
        }

        this.destroy(true);

        this.streamSwarmId = streamSwarmId;
        this.masterSwarmId = masterSwarmId;
        this.debug("stream swarm ID", this.streamSwarmId);

        this.pendingTrackerClient = {
            isDestroyed: false
        };

        const pendingTrackerClient = this.pendingTrackerClient;

        // TODO: native browser 'crypto.subtle' implementation doesn't work in Chrome in insecure pages
        // TODO: Edge doesn't support SHA-1. Change to SHA-256 once Edge support is required.
        // const infoHash = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(PEER_PROTOCOL_VERSION + this.streamSwarmId));

        const infoHash = new sha1().update(PEER_PROTOCOL_VERSION + this.streamSwarmId).digest();

        // destroy may be called while waiting for the hash to be calculated
        if (!pendingTrackerClient.isDestroyed) {
            this.pendingTrackerClient = null;
            this.createClient(infoHash);
        } else if (this.trackerClient != null) {
            this.trackerClient.destroy();
            this.trackerClient = null;
        }
    }

    private createClient(infoHash: ArrayBuffer): void {
        if (!this.settings.useP2P) {
            return;
        }

        const clientOptions = {
            infoHash: Buffer.from(infoHash, 0, 20),
            peerId: Buffer.from(this.peerId, 0, 20),
            announce: this.settings.trackerAnnounce,
            rtcConfig: this.settings.rtcConfig,
            port: 6881 // a dummy value allows running in Node.js environment
        };

        let oldTrackerClient = this.trackerClient;

        this.trackerClient = new Client(clientOptions);
        this.trackerClient.on("error", this.onTrackerError);
        this.trackerClient.on("warning", this.onTrackerWarning);
        this.trackerClient.on("update", this.onTrackerUpdate);
        this.trackerClient.on("peer", this.onTrackerPeer);

        this.trackerClient.start();

        if (oldTrackerClient != null) {
            oldTrackerClient.destroy();
            oldTrackerClient = null;
        }
    }

    private onTrackerError = (error: any) => {
        this.debug("tracker error", error);
    };

    private onTrackerWarning = (warning: any) => {
        this.debug("tracker warning", warning);
    };

    private onTrackerUpdate = (data: any): void => {
        this.debug("tracker update", data);
        this.emit("tracker-update", data);
    };

    private onTrackerPeer = (trackerPeer: any): void => {
        this.debug("tracker peer", trackerPeer.id, trackerPeer);

        if (this.peers.has(trackerPeer.id)) {
            this.debug("tracker peer already connected", trackerPeer.id, trackerPeer);
            trackerPeer.destroy();
            return;
        }

        const peer = new MediaPeer(trackerPeer, this.settings);

        peer.on("connect", this.onPeerConnect);
        peer.on("close", this.onPeerClose);
        peer.on("data-updated", this.onPeerDataUpdated);
        peer.on("segment-request", this.onSegmentRequest);
        peer.on("segment-loaded", this.onSegmentLoaded);
        peer.on("segment-absent", this.onSegmentAbsent);
        peer.on("segment-error", this.onSegmentError);
        peer.on("segment-timeout", this.onSegmentTimeout);
        peer.on("bytes-downloaded", this.onPieceBytesDownloaded);
        peer.on("bytes-uploaded", this.onPieceBytesUploaded);

        let peerCandidatesById = this.peerCandidates.get(peer.id);

        if (!peerCandidatesById) {
            peerCandidatesById = [];
            this.peerCandidates.set(peer.id, peerCandidatesById);
        }

        peerCandidatesById.push(peer);
    };

    public download(segment: Segment): boolean {
        if (this.isDownloading(segment)) {
            return false;
        }

        const candidates: MediaPeer[] = [];

        for (const peer of this.peers.values()) {
            if ((peer.getDownloadingSegmentId() == null) &&
                    (peer.getSegmentsMap().get(segment.id) === MediaPeerSegmentStatus.Loaded)) {
                candidates.push(peer);
            }
        }

        if (candidates.length === 0) {
            return false;
        }

        const peer = candidates[Math.floor(Math.random() * candidates.length)];
        peer.requestSegment(segment.id);
        this.peerSegmentRequests.set(segment.id, new PeerSegmentRequest(peer.id, segment));
        return true;
    }

    public abort(segment: Segment): ArrayBuffer[] | undefined {
        let downloadingSegment: ArrayBuffer[] | undefined;
        const peerSegmentRequest = this.peerSegmentRequests.get(segment.id);
        if (peerSegmentRequest) {
            const peer = this.peers.get(peerSegmentRequest.peerId);
            if (peer) {
                downloadingSegment = peer.cancelSegmentRequest();
            }
            this.peerSegmentRequests.delete(segment.id);
        }
        return downloadingSegment;
    }

    public isDownloading(segment: Segment): boolean {
        return this.peerSegmentRequests.has(segment.id);
    }

    public getActiveDownloadsCount(): number {
        return this.peerSegmentRequests.size;
    }

    public destroy(swarmChange: boolean = false): void {
        this.streamSwarmId = null;

        if (this.trackerClient) {
            this.trackerClient.stop();
            if (swarmChange) {
                // Don't destroy trackerClient to reuse its WebSocket connection to the tracker server
                this.trackerClient.removeAllListeners("error");
                this.trackerClient.removeAllListeners("warning");
                this.trackerClient.removeAllListeners("update");
                this.trackerClient.removeAllListeners("peer");
            } else {
                this.trackerClient.destroy();
                this.trackerClient = null;
            }
        }

        if (this.pendingTrackerClient) {
            this.pendingTrackerClient.isDestroyed = true;
            this.pendingTrackerClient = null;
        }

        this.peers.forEach(peer => peer.destroy());
        this.peers.clear();

        this.peerSegmentRequests.clear();

        for (const peerCandidateById of this.peerCandidates.values()) {
            for (const peerCandidate of peerCandidateById) {
                peerCandidate.destroy();
            }
        }
        this.peerCandidates.clear();
    }

    public sendSegmentsMapToAll(segmentsMap: {[key: string]: [string, number[]]}): void {
        this.peers.forEach(peer => peer.sendSegmentsMap(segmentsMap));
    }

    public sendSegmentsMap(peerId: string, segmentsMap: {[key: string]: [string, number[]]}): void {
        const peer = this.peers.get(peerId);
        if (peer) {
            peer.sendSegmentsMap(segmentsMap);
        }
    }

    public getOvrallSegmentsMap(): Map<string, MediaPeerSegmentStatus> {
        const overallSegmentsMap: Map<string, MediaPeerSegmentStatus> = new Map();

        for (const peer of this.peers.values()) {
            for (const [segmentId, segmentStatus] of peer.getSegmentsMap()) {
                if (segmentStatus === MediaPeerSegmentStatus.Loaded) {
                    overallSegmentsMap.set(segmentId, MediaPeerSegmentStatus.Loaded);
                } else if (!overallSegmentsMap.get(segmentId)) {
                    overallSegmentsMap.set(segmentId, MediaPeerSegmentStatus.LoadingByHttp);
                }
            }
        }

        return overallSegmentsMap;
    }

    private onPieceBytesDownloaded = (peer: MediaPeer, bytes: number) => {
        this.emit("bytes-downloaded", bytes, peer.id);
    };

    private onPieceBytesUploaded = (peer: MediaPeer, bytes: number) => {
        this.emit("bytes-uploaded", bytes, peer.id);
    };

    private onPeerConnect = (peer: MediaPeer) => {
        const connectedPeer = this.peers.get(peer.id);

        if (connectedPeer) {
            this.debug("tracker peer already connected (in peer connect)", peer.id, peer);
            peer.destroy();
            return;
        }

        // First peer with the ID connected
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

        this.emit("peer-connected", {id: peer.id, remoteAddress: peer.remoteAddress});
    };

    private onPeerClose = (peer: MediaPeer) => {
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

        for (const [key, value] of this.peerSegmentRequests) {
            if (value.peerId == peer.id) {
                this.peerSegmentRequests.delete(key);
            }
        }

        this.peers.delete(peer.id);
        this.emit("peer-data-updated");
        this.emit("peer-closed", peer.id);
    };

    private onPeerDataUpdated = () => {
        this.emit("peer-data-updated");
    };

    private onSegmentRequest = async (peer: MediaPeer, segmentId: string) => {
        if (this.masterSwarmId === undefined) {
            return;
        }

        const segment = await this.sementsStorage.getSegment(segmentId, this.masterSwarmId);
        if (segment) {
            peer.sendSegmentData(segmentId, segment.data!);
        } else {
            peer.sendSegmentAbsent(segmentId);
        }
    };

    private onSegmentLoaded = async (peer: MediaPeer, segmentId: string, data: ArrayBuffer) => {
        const peerSegmentRequest = this.peerSegmentRequests.get(segmentId);
        if (!peerSegmentRequest) {
            return;
        }

        const segment = peerSegmentRequest.segment;

        if (this.settings.segmentValidator) {
            try {
                await this.settings.segmentValidator(new Segment(
                    segment.id,
                    segment.url,
                    segment.masterSwarmId,
                    segment.masterManifestUri,
                    segment.streamId,
                    segment.sequence,
                    segment.range,
                    segment.priority,
                    data
                ), "p2p", peer.id);
            } catch (error) {
                this.debug("segment validator failed", error);
                this.peerSegmentRequests.delete(segmentId);
                this.emit("segment-error", segment, error, peer.id);
                this.onPeerClose(peer);
                return;
            }
        }

        this.peerSegmentRequests.delete(segmentId);
        this.emit("segment-loaded", segment, data, peer.id);
    };

    private onSegmentAbsent = (peer: MediaPeer, segmentId: string) => {
        this.peerSegmentRequests.delete(segmentId);
        this.emit("peer-data-updated");
    };

    private onSegmentError = (peer: MediaPeer, segmentId: string, description: string) => {
        const peerSegmentRequest = this.peerSegmentRequests.get(segmentId);
        if (peerSegmentRequest) {
            this.peerSegmentRequests.delete(segmentId);
            this.emit("segment-error", peerSegmentRequest.segment, description, peer.id);
        }
    };

    private onSegmentTimeout = (peer: MediaPeer, segmentId: string) => {
        const peerSegmentRequest = this.peerSegmentRequests.get(segmentId);
        if (peerSegmentRequest) {
            this.peerSegmentRequests.delete(segmentId);
            peer.destroy();
            if (this.peers.delete(peerSegmentRequest.peerId)) {
                this.emit("peer-data-updated");
            }
        }
    }
}
