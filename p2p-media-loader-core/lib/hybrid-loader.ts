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

import {LoaderInterface, Events, Segment, XhrSetupCallback} from "./loader-interface";
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
    requiredSegmentsPriority: 1,
    simultaneousP2PDownloads: 3,
    httpDownloadProbability: 0.06,
    httpDownloadProbabilityInterval: 500,
    bufferedSegmentsCount: 20,

    webRtcMaxMessageSize: 64 * 1024 - 1,
    p2pSegmentDownloadTimeout: 60000,
    trackerAnnounce: ["wss://tracker.btorrent.xyz", "wss://tracker.openwebtorrent.com", "wss://tracker.fastcast.nz"],
    rtcConfig: (Peer as any).config
};

export default class HybridLoader extends EventEmitter implements LoaderInterface {

    private readonly debug = Debug("p2pml:hybrid-loader");
    private readonly httpManager: HttpMediaManager;
    private readonly p2pManager: P2PMediaManager;
    private readonly segments: Map<string, SegmentInternal> = new Map();
    private segmentsQueue: Segment[] = [];
    private httpDownloadProbabilityTimestamp = -999999;
    private readonly speedApproximator = new SpeedApproximator();
    private readonly settings: Settings;

    public static isSupported(): boolean {
        const browserRtc = (getBrowserRTC as Function)();
        return (browserRtc && (browserRtc.RTCPeerConnection.prototype.createDataChannel !== undefined));
    }

    public constructor(settings: any = {}) {
        super();

        this.settings = Object.assign(defaultSettings, settings);
        this.debug("loader settings", this.settings);

        this.httpManager = this.createHttpManager();
        this.httpManager.on("segment-loaded", this.onSegmentLoaded);
        this.httpManager.on("segment-error", this.onSegmentError);
        this.httpManager.on("bytes-downloaded", (bytes: number) => this.onPieceBytesDownloaded("http", bytes));

        this.p2pManager = this.createP2PManager();
        this.p2pManager.on("segment-loaded", this.onSegmentLoaded);
        this.p2pManager.on("segment-error", this.onSegmentError);
        this.p2pManager.on("peer-data-updated", () => this.processSegmentsQueue());
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
        this.p2pManager.setSwarmId(swarmId);
        this.debug("load segments", segments, this.segmentsQueue);

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

        if (updateSegmentsMap) {
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
        this.segmentsQueue = [];
        this.httpManager.destroy();
        this.p2pManager.destroy();
        this.segments.clear();
    }

    private processSegmentsQueue(): boolean {
        const startingPriority = this.segmentsQueue.length > 0 ? this.segmentsQueue[0].priority : 0;
        this.debug("processSegmentsQueue - starting priority: " + startingPriority);

        let pendingCount = 0;
        for (const segment of this.segmentsQueue) {
            if (!this.segments.has(segment.id) && !this.httpManager.isDownloading(segment) && !this.p2pManager.isDownloading(segment)) {
                pendingCount++;
            }
        }

        if (pendingCount == 0) {
            return false;
        }

        let downloadedSegmentsCount = this.segmentsQueue.length - pendingCount;
        let updateSegmentsMap = false;

        for (let index = 0; index < this.segmentsQueue.length; index++) {
            const segment = this.segmentsQueue[index];
            const segmentPriority = index + startingPriority;

            if (!this.segments.has(segment.id)) {
                if (segmentPriority <= this.settings.requiredSegmentsPriority) {
                    if (segmentPriority == 0 && !this.httpManager.isDownloading(segment) && this.httpManager.getActiveDownloadsCount() > 0) {
                        for (const s of this.segmentsQueue) {
                            this.httpManager.abort(s);
                            updateSegmentsMap = true;
                        }
                    }

                    if (this.httpManager.getActiveDownloadsCount() == 0) {
                        this.p2pManager.abort(segment);
                        this.httpManager.download(segment);
                        this.debug("HTTP download (priority)", segment.priority, segment.url);
                        updateSegmentsMap = true;
                    }
                } else if (!this.httpManager.isDownloading(segment) && this.p2pManager.getActiveDownloadsCount() < this.settings.simultaneousP2PDownloads && downloadedSegmentsCount < this.settings.bufferedSegmentsCount) {
                    if (this.p2pManager.download(segment)) {
                        this.debug("P2P download", segment.priority, segment.url);
                    }
                }
            }

            if (this.httpManager.getActiveDownloadsCount() == 1 && this.p2pManager.getActiveDownloadsCount() == this.settings.simultaneousP2PDownloads) {
                return updateSegmentsMap;
            }
        }

        if (this.httpManager.getActiveDownloadsCount() > 0) {
            return updateSegmentsMap;
        }

        const now = this.now();
        if (now - this.httpDownloadProbabilityTimestamp < this.settings.httpDownloadProbabilityInterval) {
            return updateSegmentsMap;
        } else {
            this.httpDownloadProbabilityTimestamp = now;
        }

        let pendingQueue = this.segmentsQueue.filter(segment =>
            !this.segments.has(segment.id) &&
            !this.p2pManager.isDownloading(segment));
        downloadedSegmentsCount = this.segmentsQueue.length - pendingQueue.length;

        if (pendingQueue.length == 0 || downloadedSegmentsCount >= this.settings.bufferedSegmentsCount) {
            return updateSegmentsMap;
        }

        const segmentsMap = this.p2pManager.getOvrallSegmentsMap();
        pendingQueue = pendingQueue.filter(segment => !segmentsMap.get(segment.id));

        if (pendingQueue.length == 0) {
            return updateSegmentsMap;
        }

        for (const segment of pendingQueue) {
            if (Math.random() <= this.settings.httpDownloadProbability) {
                this.debug("HTTP download (random)", segment.priority, segment.url);
                this.httpManager.download(segment);
                updateSegmentsMap = true;
                break;
            }
        }

        return updateSegmentsMap;
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
        this.p2pManager.sendSegmentsMapToAll(this.createSegmentsMap());
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

    private createSegmentsMap(): string[][] {
        const segmentsMap: string[][] = [];
        this.segments.forEach((value, key) => segmentsMap.push([key, MediaPeerSegmentStatus.Loaded]));
        this.httpManager.getActiveDownloadsKeys().forEach(key => segmentsMap.push([key, MediaPeerSegmentStatus.LoadingByHttp]));
        return segmentsMap;
    }

    private onPeerConnect = (peer: {id: string}) => {
        this.p2pManager.sendSegmentsMap(peer.id, this.createSegmentsMap());
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
     * The maximum priority of the segments to be downloaded (if not available) as quickly as possible (i.e. via HTTP method).
     */
    requiredSegmentsPriority: number;

    /**
     * Max number of simultaneous downloads from peers.
     */
    simultaneousP2PDownloads: number;

    /**
     * Probability of downloading remaining not downloaded segment in the segments queue via HTTP.
     */
    httpDownloadProbability: number;

    /**
     * Interval of the httpDownloadProbability check (in milliseconds).
     */
    httpDownloadProbabilityInterval: number;

    /**
     * Max number of the segments to be downloaded via HTTP or P2P methods.
     */
    bufferedSegmentsCount: number;

    /**
     * Max WebRTC message size. 64KiB - 1B should work with most of recent browsers. Set it to 16KiB for older browsers support.
     */
    webRtcMaxMessageSize: number;

    /**
     * Timeout to download a segment from a peer. If exceeded the peer is dropped.
     */
    p2pSegmentDownloadTimeout: number;

    /**
     * Torrent trackers (announcers) to use.
     */
    trackerAnnounce: string[];

    /**
     * An RTCConfiguration dictionary providing options to configure WebRTC connections.
     */
    rtcConfig: any;

    /**
     * XMLHttpRequest setup callback. Handle it when you need additional setup for requests made by the library.
     */
    xhrSetup?: XhrSetupCallback;
}
