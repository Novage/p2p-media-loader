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
import {BandwidthApproximator} from "./bandwidth-approximator";

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
    httpDownloadInitialTimeout: 0,
    httpDownloadInitialTimeoutPerSegment: 4000,
    httpUseRanges: false,

    simultaneousP2PDownloads: 3,
    p2pDownloadMaxPriority: 20,
    p2pSegmentDownloadTimeout: 60000,

    webRtcMaxMessageSize: 64 * 1024 - 1,
    trackerAnnounce: ["wss://tracker.novage.com.ua", "wss://tracker.btorrent.xyz", "wss://tracker.openwebtorrent.com", "wss://tracker.fastcast.nz"],
    rtcConfig: (Peer as any).config
};

export default class HybridLoader extends EventEmitter implements LoaderInterface {

    private readonly debug = Debug("p2pml:hybrid-loader");
    private readonly debugSegments = Debug("p2pml:hybrid-loader-segments");
    private readonly httpManager: HttpMediaManager;
    private readonly p2pManager: P2PMediaManager;
    private readonly cachedSegments: Map<string, {segment: Segment, lastAccessed: number}> = new Map();
    private segmentsQueue: Segment[] = [];
    private readonly bandwidthApproximator = new BandwidthApproximator();
    private readonly settings: Settings;
    private httpRandomDownloadInterval: ReturnType<typeof setInterval> | undefined;
    private httpDownloadInitialTimeoutTimestamp = -Infinity;
    private initialDownloadedViaP2PSegmentsCount = 0;

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
        this.p2pManager.on("tracker-update", this.onTrackerUpdate);
    }

    private createHttpManager() {
        return new HttpMediaManager(this.settings);
    }

    private createP2PManager() {
        return new P2PMediaManager(this.cachedSegments, this.settings);
    }

    public load(segments: Segment[], variantSwarmId: string): void {
        if (this.httpRandomDownloadInterval === undefined) { // Do once on first call
            this.httpRandomDownloadInterval = setInterval(this.downloadRandomSegmentOverHttp, this.settings.httpDownloadProbabilityInterval);

            if (this.settings.httpDownloadInitialTimeout > 0 && this.settings.httpDownloadInitialTimeoutPerSegment > 0) {
                // Initialize initial HTTP download timeout (i.e. download initial segments over P2P)
                this.debugSegments("enable initial HTTP download timeout", this.settings.httpDownloadInitialTimeout, "per segment", this.settings.httpDownloadInitialTimeoutPerSegment);
                this.httpDownloadInitialTimeoutTimestamp = this.now();
                setTimeout(this.processInitialSegmentTimeout, this.settings.httpDownloadInitialTimeoutPerSegment + 100);
            }
        }

        this.p2pManager.setVariantSwarmId(variantSwarmId);
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

        this.segmentsQueue = segments;

        updateSegmentsMap = this.processSegmentsQueue() || updateSegmentsMap;
        updateSegmentsMap = this.collectGarbage() || updateSegmentsMap;

        if (updateSegmentsMap && !this.settings.consumeOnly) {
            this.p2pManager.sendSegmentsMapToAll(this.createSegmentsMap());
        }
    }

    public getSegment(id: string): Segment | undefined {
        const cachedSegment = this.cachedSegments.get(id);
        if (cachedSegment !== undefined) {
            cachedSegment.lastAccessed = this.now();
            return cachedSegment.segment;
        } else {
            return undefined;
        }
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

        this.initialDownloadedViaP2PSegmentsCount = 0;
        this.httpDownloadInitialTimeoutTimestamp = -Infinity;

        this.segmentsQueue = [];
        this.httpManager.destroy();
        this.p2pManager.destroy();
        this.cachedSegments.clear();
    }

    private processInitialSegmentTimeout = () => {
        if (this.httpRandomDownloadInterval === undefined) {
            return; // Instance destroyed
        }

        if (this.processSegmentsQueue() && !this.settings.consumeOnly) {
            this.p2pManager.sendSegmentsMapToAll(this.createSegmentsMap());
        }

        if (this.httpDownloadInitialTimeoutTimestamp !== -Infinity) {
            // Set one more timeout for a next segment
            setTimeout(this.processInitialSegmentTimeout, this.settings.httpDownloadInitialTimeoutPerSegment);
        }
    }

    private processSegmentsQueue(): boolean {
        this.debugSegments("process segments queue. priority",
                this.segmentsQueue.length > 0 ? this.segmentsQueue[0].priority : 0);

        let updateSegmentsMap = false;
        let segmentsMap: Map<string, MediaPeerSegmentStatus> | undefined;

        let httpAllowed = true;

        if (this.httpDownloadInitialTimeoutTimestamp !== -Infinity) {
            const httpTimeout = this.now() - this.httpDownloadInitialTimeoutTimestamp;
            httpAllowed =
                (httpTimeout >= (this.initialDownloadedViaP2PSegmentsCount + 1) * this.settings.httpDownloadInitialTimeoutPerSegment) ||
                (httpTimeout >= this.settings.httpDownloadInitialTimeout);

            if (httpAllowed) {
                this.debugSegments("cancel initial HTTP download timeout - timed out");
                this.httpDownloadInitialTimeoutTimestamp = -Infinity;
            }
        }

        for (let index = 0; index < this.segmentsQueue.length; index++) {
            const segment = this.segmentsQueue[index];

            if (this.cachedSegments.has(segment.id) || this.httpManager.isDownloading(segment)) {
                continue;
            }

            if (segment.priority <= this.settings.requiredSegmentsPriority && httpAllowed && !this.httpManager.isFailed(segment)) {
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
                    const downloadedPieces = this.p2pManager.abort(segment);
                    this.httpManager.download(segment, downloadedPieces);
                    this.debugSegments("HTTP download (priority)", segment.priority, segment.url);
                    updateSegmentsMap = true;
                    continue;
                }
            }

            if (this.p2pManager.isDownloading(segment)) {
                continue;
            }

            if (segment.priority <= this.settings.requiredSegmentsPriority) { // Download required segments over P2P
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
        if (this.httpRandomDownloadInterval === undefined) {
            return; // Instance destroyed
        }

        if (this.httpDownloadInitialTimeoutTimestamp !== -Infinity ||
                this.httpManager.getActiveDownloadsCount() >= this.settings.simultaneousHttpDownloads ||
                (this.settings.httpDownloadProbabilitySkipIfNoPeers && this.p2pManager.getPeers().size === 0) ||
                this.settings.consumeOnly) {
            return;
        }

        const segmentsMap = this.p2pManager.getOvrallSegmentsMap();

        const pendingQueue = this.segmentsQueue.filter(segment =>
            !this.cachedSegments.has(segment.id) &&
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
        this.bandwidthApproximator.addBytes(bytes, this.now());
        this.emit(Events.PieceBytesDownloaded, method, bytes, peerId);
    }

    private onPieceBytesUploaded = (method: "p2p", bytes: number, peerId?: string) => {
        this.emit(Events.PieceBytesUploaded, method, bytes, peerId);
    }

    private onSegmentLoaded = (segment: Segment, data: ArrayBuffer, peerId?: string) => {
        this.debugSegments("segment loaded", segment.id, segment.url);

        segment.data = data;

        this.cachedSegments.set(segment.id, {segment, lastAccessed: this.now()});
        this.emit(Events.SegmentLoaded, segment, peerId);

        if (this.httpDownloadInitialTimeoutTimestamp !== -Infinity) {
            // If initial HTTP download timeout enabled then
            // count sequential P2P segment downloads
            let loadedSegmentFound = false;
            for (const queueSegment of this.segmentsQueue) {
                if (queueSegment.id === segment.id) {
                    loadedSegmentFound = true;
                } else if (!this.cachedSegments.has(queueSegment.id)) {
                    break;
                }

                if (loadedSegmentFound) {
                    this.initialDownloadedViaP2PSegmentsCount++;
                }
            }
        }

        this.processSegmentsQueue();
        if (!this.settings.consumeOnly) {
            this.p2pManager.sendSegmentsMapToAll(this.createSegmentsMap());
        }
    }

    private onSegmentError = (segment: Segment, details: any, peerId?: string) => {
        this.debugSegments("segment error", segment.id, segment.url, peerId, details);
        this.emit(Events.SegmentError, segment, details, peerId);
        this.processSegmentsQueue();
    }

    private createSegmentsMap() {
        const segmentsMap: {[key: string]: [string, number[]]} = {};

        function addSegmentToMap(swarmWithSegmentId: string, status: MediaPeerSegmentStatus) {
            // For now we rely on common format of segment ID = variant swarm ID + segment ID
            // TODO: in next major relese segment should contain swarm ID and segment ID in the swarm fields.
            const separatorIndex = swarmWithSegmentId.lastIndexOf("+");
            const variantSwarmId = swarmWithSegmentId.substring(0, separatorIndex);
            const segmentId = swarmWithSegmentId.substring(separatorIndex + 1);
            let segmentsIdsAndStatuses = segmentsMap[variantSwarmId];
            if (segmentsIdsAndStatuses === undefined) {
                segmentsIdsAndStatuses = ["", []];
                segmentsMap[variantSwarmId] = segmentsIdsAndStatuses;
            }
            const segmentsStatuses = segmentsIdsAndStatuses[1];
            segmentsIdsAndStatuses[0] += ((segmentsStatuses.length == 0) ? segmentId : `|${segmentId}`);
            segmentsStatuses.push(status);
        }

        for (const segmentId of this.cachedSegments.keys()) {
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

    private onTrackerUpdate = (data: { incomplete?: number }) => {
        if (this.httpDownloadInitialTimeoutTimestamp !== -Infinity &&
                data.incomplete !== undefined && data.incomplete <= 1) {

            this.debugSegments("cancel initial HTTP download timeout - no peers");

            this.httpDownloadInitialTimeoutTimestamp = -Infinity;
            if (this.processSegmentsQueue() && !this.settings.consumeOnly) {
                this.p2pManager.sendSegmentsMapToAll(this.createSegmentsMap());
            }
        }
    }

    private collectGarbage(): boolean {
        const segmentsToDelete: string[] = [];
        const remainingSegments: {segment: Segment, lastAccessed: number}[] = [];

        // Delete old segments
        const now = this.now();

        for (const cachedSegment of this.cachedSegments.values()) {
            if (now - cachedSegment.lastAccessed > this.settings.cachedSegmentExpiration) {
                segmentsToDelete.push(cachedSegment.segment.id);
            } else {
                remainingSegments.push(cachedSegment);
            }
        }

        // Delete segments over cached count
        let countOverhead = remainingSegments.length - this.settings.cachedSegmentsCount;
        if (countOverhead > 0) {
            remainingSegments.sort((a, b) => a.lastAccessed - b.lastAccessed);

            for (const cachedSegment of remainingSegments) {
                if (!this.segmentsQueue.find(queueSegment => queueSegment.id === cachedSegment.segment.id)) {
                    segmentsToDelete.push(cachedSegment.segment.id);
                    countOverhead--;
                    if (countOverhead == 0) {
                        break;
                    }
                }
            }
        }

        segmentsToDelete.forEach(id => this.cachedSegments.delete(id));
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
     * Try to download initial segments over P2P if the value is > 0.
     * But HTTP download will be forcibly enabled if there is no peers on tracker or
     * single sequential segment P2P download is timed out (see httpDownloadInitialTimeoutPerSegment).
     */
    httpDownloadInitialTimeout: number;


    /**
     * Use HTTP ranges requests where it is possible.
     * Allows to continue (and not start over) aborted P2P downloads over HTTP.
     */
    httpUseRanges: boolean;

    /**
     * If initial HTTP download timeout is enabled (see httpDownloadInitialTimeout)
     * this parameter sets additional timeout for a single sequential segment download
     * over P2P. It will cancel initial HTTP download timeout mode if a segment download is timed out.
     */
    httpDownloadInitialTimeoutPerSegment: number;

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
