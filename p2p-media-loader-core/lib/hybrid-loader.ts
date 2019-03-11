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

import {LoaderInterface, Events, Segment, SegmentValidatorCallback, XhrSetupCallback, SegmentUrlBuilder} from "./loader-interface";
import {EventEmitter} from "events";
import {HttpMediaManager} from "./http-media-manager";
import {P2PMediaManager} from "./p2p-media-manager";
import {MediaPeerSegmentStatus} from "./media-peer";
import {SegmentInternal} from "./segment-internal";
import {SpeedApproximator} from "./speed-approximator";

import * as getBrowserRTC from "get-browser-rtc";
import * as Peer from "simple-peer";

const defaultSettings: Settings = {
    cachedSegmentExpiration: 5 * 60 * 1000,
    cachedSegmentsCount: 30,

    useP2P: true,
    consumeOnly: false,

    requiredSegmentsPriority: 1,

    simultaneousHttpDownloads: 2,
    httpDownloadProbability: 0.06,
    httpDownloadProbabilityInterval: 500,
    httpDownloadProbabilitySkipIfNoPeers: false,
    httpFailedSegmentTimeout: 10000,
    httpDownloadMaxPriority: 20,

    simultaneousP2PDownloads: 3,
    p2pDownloadMaxPriority: 20,
    p2pSegmentDownloadTimeout: 60000,

    webRtcMaxMessageSize: 64 * 1024 - 1,
    trackerAnnounce: ["wss://tracker.btorrent.xyz", "wss://tracker.openwebtorrent.com", "wss://tracker.fastcast.nz"],
    rtcConfig: (Peer as any).config
};

export default class HybridLoader extends EventEmitter implements LoaderInterface {

    private readonly debug = Debug("p2pml:hybrid-loader");
    private readonly debugSegments = Debug("p2pml:hybrid-loader-segments");
    private readonly httpManager: HttpMediaManager;
    private readonly p2pManager: P2PMediaManager;
    private readonly segments: Map<string, SegmentInternal> = new Map();
    private segmentsQueue: Segment[] = [];
    private readonly speedApproximator = new SpeedApproximator();
    private readonly settings: Settings;
    private httpRandomDownloadInterval: ReturnType<typeof setInterval> | undefined;

    public static isSupported(): boolean {
        const browserRtc = (getBrowserRTC as Function)();
        return (browserRtc && (browserRtc.RTCPeerConnection.prototype.createDataChannel !== undefined));
    }

    public constructor(settings: any = {}) {
        super();

        this.settings = { ...defaultSettings, ...settings };

        if ((settings as any).bufferedSegmentsCount) {
            if (settings.p2pDownloadMaxPriority === undefined) {
                this.settings.p2pDownloadMaxPriority = (settings as any).bufferedSegmentsCount;
            }

            if (settings.httpDownloadMaxPriority === undefined) {
                this.settings.p2pDownloadMaxPriority = (settings as any).bufferedSegmentsCount;
            }

            delete (this.settings as any).bufferedSegmentsCount;
        }

        this.debug("loader settings", this.settings);

        this.httpManager = this.createHttpManager();
        this.httpManager.on("segment-loaded", this.onSegmentLoaded);
        this.httpManager.on("segment-error", this.onSegmentError);
        this.httpManager.on("bytes-downloaded", (bytes: number) => this.onPieceBytesDownloaded("http", bytes));

        this.p2pManager = this.createP2PManager();
        this.p2pManager.on("segment-loaded", this.onSegmentLoaded);
        this.p2pManager.on("segment-error", this.onSegmentError);
        this.p2pManager.on("peer-data-updated", () => {
            if (this.processSegmentsQueue() && !this.settings.consumeOnly) {
                this.p2pManager.sendSegmentsMapToAll(this.createSegmentsMap());
            }
        });
        this.p2pManager.on("bytes-downloaded", (bytes: number, peerId: string) => this.onPieceBytesDownloaded("p2p", bytes, peerId));
        this.p2pManager.on("bytes-uploaded", (bytes: number, peerId: string) => this.onPieceBytesUploaded("p2p", bytes, peerId));
        this.p2pManager.on("peer-connected", this.onPeerConnect);
        this.p2pManager.on("peer-closed", this.onPeerClose);
    }

    private createHttpManager() {
        return new HttpMediaManager(this.settings);
    }

    private createP2PManager() {
        return new P2PMediaManager(this.segments, this.settings);
    }

    public load(segments: Segment[], swarmId: string): void {
        if (this.httpRandomDownloadInterval === undefined) { // Do once on first call
            this.httpRandomDownloadInterval = setInterval(this.downloadRandomSegmentOverHttp, this.settings.httpDownloadProbabilityInterval);
        }

        this.p2pManager.setSwarmId(swarmId);
        this.debug("load segments");

        let updateSegmentsMap = false;

        // stop all http requests and p2p downloads for segments that are not in the new load
        for (const segment of this.segmentsQueue) {
            if (!segments.find(f => f.url == segment.url)) {
                this.debug("remove segment", segment.url);
                if (this.httpManager.isDownloading(segment)) {
                    updateSegmentsMap = true;
                    this.httpManager.abort(segment);
                } else {
                    this.p2pManager.abort(segment);
                }
                this.emit(Events.SegmentAbort, segment);
            }
        }

        for (const segment of segments) {
            if (!this.segmentsQueue.find(f => f.url == segment.url)) {
                this.debug("add segment", segment.url);
            }
        }

        // renew segment queue
        this.segmentsQueue = segments;

        // run main processing algorithm
        updateSegmentsMap = this.processSegmentsQueue() || updateSegmentsMap;

        // collect garbage
        updateSegmentsMap = this.collectGarbage() || updateSegmentsMap;

        if (updateSegmentsMap && !this.settings.consumeOnly) {
            this.p2pManager.sendSegmentsMapToAll(this.createSegmentsMap());
        }
    }

    public getSegment(id: string): Segment | undefined {
        const segment = this.segments.get(id);
        return segment
            ? segment.data
                ? new Segment(segment.id, segment.url, segment.range, segment.priority, segment.data, segment.downloadSpeed)
                : undefined
            : undefined;
    }

    public getSettings() {
        return this.settings;
    }

    public getDetails() {
        return {
            peerId: this.p2pManager.getPeerId()
        };
    }

    public destroy(): void {
        if (this.httpRandomDownloadInterval !== undefined) {
            clearInterval(this.httpRandomDownloadInterval);
            this.httpRandomDownloadInterval = undefined;
        }
        this.segmentsQueue = [];
        this.httpManager.destroy();
        this.p2pManager.destroy();
        this.segments.clear();
    }

    private processSegmentsQueue(): boolean {
        this.debugSegments("process segments queue. priority",
                this.segmentsQueue.length > 0 ? this.segmentsQueue[0].priority : 0);

        let updateSegmentsMap = false;
        let segmentsMap: Map<string, MediaPeerSegmentStatus> | undefined;

        for (let index = 0; index < this.segmentsQueue.length; index++) {
            const segment = this.segmentsQueue[index];

            if (this.segments.has(segment.id) || this.httpManager.isDownloading(segment)) {
                continue;
            }

            if (segment.priority <= this.settings.requiredSegmentsPriority && !this.httpManager.isFailed(segment)) {
                // Download required segments over HTTP
                if (this.httpManager.getActiveDownloadsCount() >= this.settings.simultaneousHttpDownloads) {
                    // Not enough HTTP download resources. Abort one of the HTTP downloads.
                    for (let i = this.segmentsQueue.length - 1; i > index; i--) {
                        const segmentToAbort = this.segmentsQueue[i];
                        if (this.httpManager.isDownloading(segmentToAbort)) {
                            this.debugSegments("cancel HTTP download", segmentToAbort.priority, segmentToAbort.url);
                            this.httpManager.abort(segmentToAbort);
                            break;
                        }
                    }
                }

                if (this.httpManager.getActiveDownloadsCount() < this.settings.simultaneousHttpDownloads) {
                    // Abort P2P download of the required segment if any and force HTTP download
                    this.p2pManager.abort(segment);
                    this.httpManager.download(segment);
                    this.debugSegments("HTTP download (priority)", segment.priority, segment.url);
                    updateSegmentsMap = true;
                    continue;
                }
            }

            if (this.p2pManager.isDownloading(segment)) {
                continue;
            }

            if (segment.priority <= this.settings.requiredSegmentsPriority) {
                // Download required segments over P2P
                segmentsMap = segmentsMap ? segmentsMap : this.p2pManager.getOvrallSegmentsMap();

                if (segmentsMap.get(segment.id) !== MediaPeerSegmentStatus.Loaded) {
                    continue;
                }

                if (this.p2pManager.getActiveDownloadsCount() >= this.settings.simultaneousP2PDownloads) {
                    // Not enough P2P download resources. Abort one of the P2P downloads.
                    for (let i = this.segmentsQueue.length - 1; i > index; i--) {
                        const segmentToAbort = this.segmentsQueue[i];
                        if (this.p2pManager.isDownloading(segmentToAbort)) {
                            this.debugSegments("cancel P2P download", segmentToAbort.priority, segmentToAbort.url);
                            this.p2pManager.abort(segmentToAbort);
                            break;
                        }
                    }
                }

                if (this.p2pManager.getActiveDownloadsCount() < this.settings.simultaneousP2PDownloads) {
                    if (this.p2pManager.download(segment)) {
                        this.debugSegments("P2P download (priority)", segment.priority, segment.url);
                        continue;
                    }
                }

                continue;
            }

            if (this.p2pManager.getActiveDownloadsCount() < this.settings.simultaneousP2PDownloads &&
                    segment.priority <= this.settings.p2pDownloadMaxPriority) {
                if (this.p2pManager.download(segment)) {
                    this.debugSegments("P2P download", segment.priority, segment.url);
                }
            }
        }

        return updateSegmentsMap;
    }

    private downloadRandomSegmentOverHttp = () => {
        // TODO: check if destroyed

        if (this.httpManager.getActiveDownloadsCount() >= this.settings.simultaneousHttpDownloads ||
                (this.settings.httpDownloadProbabilitySkipIfNoPeers && this.p2pManager.getPeers().size === 0) ||
                this.settings.consumeOnly) {
            return;
        }

        const segmentsMap = this.p2pManager.getOvrallSegmentsMap();

        const pendingQueue = this.segmentsQueue.filter(segment =>
            !this.segments.has(segment.id) &&
            !this.p2pManager.isDownloading(segment) &&
            !this.httpManager.isDownloading(segment) &&
            !segmentsMap.has(segment.id) &&
            !this.httpManager.isFailed(segment) &&
            (segment.priority <= this.settings.httpDownloadMaxPriority));

        if (pendingQueue.length == 0) {
            return;
        }

        if (Math.random() > this.settings.httpDownloadProbability * pendingQueue.length) {
            return;
        }

        const segment = pendingQueue[Math.floor(Math.random() * pendingQueue.length)];
        this.debugSegments("HTTP download (random)", segment.priority, segment.url);
        this.httpManager.download(segment);
        this.p2pManager.sendSegmentsMapToAll(this.createSegmentsMap());
    }

    private onPieceBytesDownloaded = (method: "http" | "p2p", bytes: number, peerId?: string) => {
        this.speedApproximator.addBytes(bytes, this.now());
        this.emit(Events.PieceBytesDownloaded, method, bytes, peerId);
    }

    private onPieceBytesUploaded = (method: "p2p", bytes: number, peerId?: string) => {
        this.speedApproximator.addBytes(bytes, this.now());
        this.emit(Events.PieceBytesUploaded, method, bytes, peerId);
    }

    private onSegmentLoaded = (segment: Segment, data: ArrayBuffer, peerId?: string) => {
        this.debug("segment loaded", segment.id, segment.url);

        const segmentInternal = new SegmentInternal(
            segment.id,
            segment.url,
            segment.range,
            segment.priority,
            data,
            this.speedApproximator.getSpeed(this.now())
        );

        this.segments.set(segment.id, segmentInternal);
        this.emitSegmentLoaded(segmentInternal, peerId);
        this.processSegmentsQueue();
        if (!this.settings.consumeOnly) {
            this.p2pManager.sendSegmentsMapToAll(this.createSegmentsMap());
        }
    }

    private onSegmentError = (segment: Segment, details: any, peerId?: string) => {
        this.emit(Events.SegmentError, segment, details, peerId);
        this.processSegmentsQueue();
    }

    private emitSegmentLoaded(segmentInternal: SegmentInternal, peerId?: string): void {
        segmentInternal.lastAccessed = this.now();

        const segment = new Segment(
            segmentInternal.id,
            segmentInternal.url,
            segmentInternal.range,
            segmentInternal.priority,
            segmentInternal.data,
            segmentInternal.downloadSpeed
        );

        this.emit(Events.SegmentLoaded, segment, peerId);
    }

    private createSegmentsMap() {
        const segmentsMap: Map<string, [string[], MediaPeerSegmentStatus[]]> = new Map();

        function addSegmentToMap(swarmWithSegmentId: string, status: MediaPeerSegmentStatus) {
            // For now we rely on common format of segment ID = swarm ID + segment ID
            // TODO: in next major relese segment should contain swarm ID and segment ID in the swarm fields.
            const separatorIndex = swarmWithSegmentId.lastIndexOf("+");
            const swarmId = swarmWithSegmentId.substring(0, separatorIndex);
            const segmentId = swarmWithSegmentId.substring(separatorIndex + 1);
            let segmentsStatuses = segmentsMap.get(swarmId);
            if (!segmentsStatuses) {
                segmentsStatuses = [[], []];
                segmentsMap.set(swarmId, segmentsStatuses);
            }
            segmentsStatuses[0].push(segmentId);
            segmentsStatuses[1].push(status);
        }

        for (const segmentId of this.segments.keys()) {
            addSegmentToMap(segmentId, MediaPeerSegmentStatus.Loaded);
        }

        for (const segmentId of this.httpManager.getActiveDownloadsKeys()) {
            addSegmentToMap(segmentId, MediaPeerSegmentStatus.LoadingByHttp);
        }

        return segmentsMap;
    }

    private onPeerConnect = (peer: {id: string}) => {
        if (!this.settings.consumeOnly) {
            this.p2pManager.sendSegmentsMap(peer.id, this.createSegmentsMap());
        }
        this.emit(Events.PeerConnect, peer);
    }

    private onPeerClose = (peerId: string) => {
        this.emit(Events.PeerClose, peerId);
    }

    private collectGarbage(): boolean {
        const segmentsToDelete: string[] = [];
        const remainingSegments: SegmentInternal[] = [];

        // Delete old segments
        const now = this.now();

        for (const segment of this.segments.values()) {
            if (now - segment.lastAccessed > this.settings.cachedSegmentExpiration) {
                segmentsToDelete.push(segment.id);
            } else {
                remainingSegments.push(segment);
            }
        }

        // Delete segments over cached count
        let countOverhead = remainingSegments.length - this.settings.cachedSegmentsCount;
        if (countOverhead > 0) {
            remainingSegments.sort((a, b) => a.lastAccessed - b.lastAccessed);

            for (const segment of remainingSegments) {
                if (!this.segmentsQueue.find(queueSegment => queueSegment.id == segment.id)) {
                    segmentsToDelete.push(segment.id);
                    countOverhead--;
                    if (countOverhead == 0) {
                        break;
                    }
                }
            }
        }

        segmentsToDelete.forEach(id => this.segments.delete(id));
        return segmentsToDelete.length > 0;
    }

    private now() {
        return performance.now();
    }

} // end of HybridLoader

interface Settings {
    /**
     * Segment lifetime in cache. The segment is deleted from the cache if the last access time is greater than this value (in milliseconds).
     */
    cachedSegmentExpiration: number;

    /**
     * Max number of segments that can be stored in the cache.
     */
    cachedSegmentsCount: number;

    /**
     * Enable/Disable peers interaction.
     */
    useP2P: boolean;

    /**
     * The peer will not upload segments data to the P2P network but still download from others.
     */
    consumeOnly: boolean;

    /**
     * The maximum priority of the segments to be downloaded (if not available) as quickly as possible (i.e. via HTTP method).
     */
    requiredSegmentsPriority: number;

    /**
     * Max number of simultaneous downloads from HTTP source.
     */
    simultaneousHttpDownloads: number;

    /**
     * Probability of downloading remaining not downloaded segment in the segments queue via HTTP.
     */
    httpDownloadProbability: number;

    /**
     * Interval of the httpDownloadProbability check (in milliseconds).
     */
    httpDownloadProbabilityInterval: number;

    /**
     * Don't download segments over HTTP randomly when there is no peers.
     */
    httpDownloadProbabilitySkipIfNoPeers: boolean;

    /**
     * Timeout before trying to load segment again via HTTP after failed attempt (in milliseconds).
     */
    httpFailedSegmentTimeout: number;

    /**
     * Segments with higher priority will not be downloaded over HTTP.
     */
    httpDownloadMaxPriority: number;

    /**
     * Max number of simultaneous downloads from peers.
     */
    simultaneousP2PDownloads: number;

    /**
     * Segments with higher priority will not be downloaded over P2P.
     */
    p2pDownloadMaxPriority: number;

    /**
     * Timeout to download a segment from a peer. If exceeded the peer is dropped.
     */
    p2pSegmentDownloadTimeout: number;

    /**
     * Max WebRTC message size. 64KiB - 1B should work with most of recent browsers. Set it to 16KiB for older browsers support.
     */
    webRtcMaxMessageSize: number;

    /**
     * Torrent trackers (announcers) to use.
     */
    trackerAnnounce: string[];

    /**
     * An RTCConfiguration dictionary providing options to configure WebRTC connections.
     */
    rtcConfig: any;

    /**
     * Segment validation callback - validates the data after it has been downloaded.
     */
    segmentValidator?: SegmentValidatorCallback;

    /**
     * XMLHttpRequest setup callback. Handle it when you need additional setup for requests made by the library.
     */
    xhrSetup?: XhrSetupCallback;

    /**
     * Allow to modify the segment URL before HTTP request.
     */
    segmentUrlBuilder?: SegmentUrlBuilder;
}
