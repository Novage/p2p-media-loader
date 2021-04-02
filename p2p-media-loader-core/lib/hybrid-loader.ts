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

import Debug from "debug";
import { EventEmitter } from "events";
import Peer from "simple-peer";

import { LoaderInterface, Events, Segment } from "./loader-interface";
import { HttpMediaManager } from "./http-media-manager";
import { P2PMediaManager } from "./p2p-media-manager";
import { MediaPeerSegmentStatus } from "./media-peer";
import { BandwidthApproximator } from "./bandwidth-approximator";
import { SegmentsMemoryStorage } from "./segments-memory-storage";

const defaultSettings: HybridLoaderSettings = {
    cachedSegmentExpiration: 5 * 60 * 1000,
    cachedSegmentsCount: 30,

    useP2P: true,
    consumeOnly: false,

    requiredSegmentsPriority: 1,

    simultaneousHttpDownloads: 2,
    httpDownloadProbability: 0.1,
    httpDownloadProbabilityInterval: 1000,
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
    trackerAnnounce: ["wss://tracker.novage.com.ua", "wss://tracker.openwebtorrent.com"],
    peerRequestsPerAnnounce: 10,
    rtcConfig: (Peer as { config: RTCConfiguration }).config,
};

export class HybridLoader extends EventEmitter implements LoaderInterface {
    private readonly debug = Debug("p2pml:hybrid-loader");
    private readonly debugSegments = Debug("p2pml:hybrid-loader-segments");
    private readonly httpManager: HttpMediaManager;
    private readonly p2pManager: P2PMediaManager;
    private segmentsStorage: SegmentsStorage;
    private segmentsQueue: Segment[] = [];
    private readonly bandwidthApproximator = new BandwidthApproximator();
    private readonly settings: HybridLoaderSettings;
    private httpRandomDownloadInterval: ReturnType<typeof setInterval> | undefined;
    private httpDownloadInitialTimeoutTimestamp = -Infinity;
    private masterSwarmId?: string;

    public static isSupported = (): boolean => {
        return window.RTCPeerConnection.prototype.createDataChannel !== undefined;
    };

    public constructor(settings: Partial<HybridLoaderSettings> = {}) {
        super();

        this.settings = { ...defaultSettings, ...settings };

        const { bufferedSegmentsCount } = settings as Record<string, unknown>;

        if (typeof bufferedSegmentsCount === "number") {
            if (settings.p2pDownloadMaxPriority === undefined) {
                this.settings.p2pDownloadMaxPriority = bufferedSegmentsCount;
            }

            if (settings.httpDownloadMaxPriority === undefined) {
                this.settings.p2pDownloadMaxPriority = bufferedSegmentsCount;
            }
        }

        this.segmentsStorage =
            this.settings.segmentsStorage === undefined
                ? new SegmentsMemoryStorage(this.settings)
                : this.settings.segmentsStorage;

        this.debug("loader settings", this.settings);

        this.httpManager = this.createHttpManager();
        this.httpManager.on("segment-loaded", this.onSegmentLoaded);
        this.httpManager.on("segment-error", this.onSegmentError);
        this.httpManager.on("bytes-downloaded", (bytes: number) => this.onPieceBytesDownloaded("http", bytes));

        this.p2pManager = this.createP2PManager();
        this.p2pManager.on("segment-loaded", this.onSegmentLoaded);
        this.p2pManager.on("segment-error", this.onSegmentError);
        this.p2pManager.on("peer-data-updated", async () => {
            if (this.masterSwarmId === undefined) {
                return;
            }

            const storageSegments = await this.segmentsStorage.getSegmentsMap(this.masterSwarmId);
            if (this.processSegmentsQueue(storageSegments) && !this.settings.consumeOnly) {
                this.p2pManager.sendSegmentsMapToAll(this.createSegmentsMap(storageSegments));
            }
        });
        this.p2pManager.on("bytes-downloaded", (bytes: number, peerId: string) =>
            this.onPieceBytesDownloaded("p2p", bytes, peerId)
        );
        this.p2pManager.on("bytes-uploaded", (bytes: number, peerId: string) =>
            this.onPieceBytesUploaded("p2p", bytes, peerId)
        );
        this.p2pManager.on("peer-connected", this.onPeerConnect);
        this.p2pManager.on("peer-closed", this.onPeerClose);
        this.p2pManager.on("tracker-update", this.onTrackerUpdate);
    }

    private createHttpManager = () => {
        return new HttpMediaManager(this.settings);
    };

    private createP2PManager = () => {
        return new P2PMediaManager(this.segmentsStorage, this.settings);
    };

    public load = async (segments: Segment[], streamSwarmId: string): Promise<void> => {
        if (this.httpRandomDownloadInterval === undefined) {
            // Do once on first call
            this.httpRandomDownloadInterval = setInterval(
                this.downloadRandomSegmentOverHttp,
                this.settings.httpDownloadProbabilityInterval
            );

            if (
                this.settings.httpDownloadInitialTimeout > 0 &&
                this.settings.httpDownloadInitialTimeoutPerSegment > 0
            ) {
                // Initialize initial HTTP download timeout (i.e. download initial segments over P2P)
                this.debugSegments(
                    "enable initial HTTP download timeout",
                    this.settings.httpDownloadInitialTimeout,
                    "per segment",
                    this.settings.httpDownloadInitialTimeoutPerSegment
                );
                this.httpDownloadInitialTimeoutTimestamp = this.now();
                setTimeout(this.processInitialSegmentTimeout, this.settings.httpDownloadInitialTimeoutPerSegment + 100);
            }
        }

        if (segments.length > 0) {
            this.masterSwarmId = segments[0].masterSwarmId;
        }

        if (this.masterSwarmId !== undefined) {
            this.p2pManager.setStreamSwarmId(streamSwarmId, this.masterSwarmId);
        }

        this.debug("load segments");

        let updateSegmentsMap = false;

        // stop all http requests and p2p downloads for segments that are not in the new load
        for (const segment of this.segmentsQueue) {
            if (!segments.find((f) => f.url === segment.url)) {
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

        if (this.debug.enabled) {
            for (const segment of segments) {
                if (!this.segmentsQueue.find((f) => f.url === segment.url)) {
                    this.debug("add segment", segment.url);
                }
            }
        }

        this.segmentsQueue = segments;

        if (this.masterSwarmId === undefined) {
            return;
        }

        let storageSegments = await this.segmentsStorage.getSegmentsMap(this.masterSwarmId);
        updateSegmentsMap = this.processSegmentsQueue(storageSegments) || updateSegmentsMap;

        if (await this.cleanSegmentsStorage()) {
            storageSegments = await this.segmentsStorage.getSegmentsMap(this.masterSwarmId);
            updateSegmentsMap = true;
        }

        if (updateSegmentsMap && !this.settings.consumeOnly) {
            this.p2pManager.sendSegmentsMapToAll(this.createSegmentsMap(storageSegments));
        }
    };

    public getSegment = async (id: string): Promise<Segment | undefined> => {
        return this.masterSwarmId === undefined ? undefined : this.segmentsStorage.getSegment(id, this.masterSwarmId);
    };

    public getSettings = (): HybridLoaderSettings => {
        return this.settings;
    };

    public getDetails = (): { peerId: string } => {
        return {
            peerId: this.p2pManager.getPeerId(),
        };
    };

    public destroy = async (): Promise<void> => {
        if (this.httpRandomDownloadInterval !== undefined) {
            clearInterval(this.httpRandomDownloadInterval);
            this.httpRandomDownloadInterval = undefined;
        }

        this.httpDownloadInitialTimeoutTimestamp = -Infinity;

        this.segmentsQueue = [];
        this.httpManager.destroy();
        this.p2pManager.destroy();
        this.masterSwarmId = undefined;
        await this.segmentsStorage.destroy();
    };

    private processInitialSegmentTimeout = async () => {
        if (this.httpRandomDownloadInterval === undefined) {
            return; // Instance destroyed
        }

        if (this.masterSwarmId !== undefined) {
            const storageSegments = await this.segmentsStorage.getSegmentsMap(this.masterSwarmId);

            if (this.processSegmentsQueue(storageSegments) && !this.settings.consumeOnly) {
                this.p2pManager.sendSegmentsMapToAll(this.createSegmentsMap(storageSegments));
            }
        }

        if (this.httpDownloadInitialTimeoutTimestamp !== -Infinity) {
            // Set one more timeout for a next segment
            setTimeout(this.processInitialSegmentTimeout, this.settings.httpDownloadInitialTimeoutPerSegment);
        }
    };

    private processSegmentsQueue = (storageSegments: Map<string, { segment: Segment }>) => {
        this.debugSegments(
            "process segments queue. priority",
            this.segmentsQueue.length > 0 ? this.segmentsQueue[0].priority : 0
        );

        if (this.masterSwarmId === undefined || this.segmentsQueue.length === 0) {
            return false;
        }

        let updateSegmentsMap = false;
        let segmentsMap: Map<string, MediaPeerSegmentStatus> | undefined;

        let httpAllowed = true;

        if (this.httpDownloadInitialTimeoutTimestamp !== -Infinity) {
            let firstNotDownloadePriority: number | undefined;

            for (const segment of this.segmentsQueue) {
                if (!storageSegments.has(segment.id)) {
                    firstNotDownloadePriority = segment.priority;
                    break;
                }
            }

            const httpTimeout = this.now() - this.httpDownloadInitialTimeoutTimestamp;
            httpAllowed =
                httpTimeout >= this.settings.httpDownloadInitialTimeout ||
                (firstNotDownloadePriority !== undefined &&
                    httpTimeout > this.settings.httpDownloadInitialTimeoutPerSegment &&
                    firstNotDownloadePriority <= 0);

            if (httpAllowed) {
                this.debugSegments("cancel initial HTTP download timeout - timed out");
                this.httpDownloadInitialTimeoutTimestamp = -Infinity;
            }
        }

        for (let index = 0; index < this.segmentsQueue.length; index++) {
            const segment = this.segmentsQueue[index];

            if (storageSegments.has(segment.id) || this.httpManager.isDownloading(segment)) {
                continue;
            }

            if (
                segment.priority <= this.settings.requiredSegmentsPriority &&
                httpAllowed &&
                !this.httpManager.isFailed(segment)
            ) {
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

            if (segment.priority <= this.settings.requiredSegmentsPriority) {
                // Download required segments over P2P
                segmentsMap = segmentsMap ? segmentsMap : this.p2pManager.getOverallSegmentsMap();

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

            if (
                this.p2pManager.getActiveDownloadsCount() < this.settings.simultaneousP2PDownloads &&
                segment.priority <= this.settings.p2pDownloadMaxPriority
            ) {
                if (this.p2pManager.download(segment)) {
                    this.debugSegments("P2P download", segment.priority, segment.url);
                }
            }
        }

        return updateSegmentsMap;
    };

    private downloadRandomSegmentOverHttp = async () => {
        if (
            this.masterSwarmId === undefined ||
            this.httpRandomDownloadInterval === undefined ||
            this.httpDownloadInitialTimeoutTimestamp !== -Infinity ||
            this.httpManager.getActiveDownloadsCount() >= this.settings.simultaneousHttpDownloads ||
            (this.settings.httpDownloadProbabilitySkipIfNoPeers && this.p2pManager.getPeers().size === 0) ||
            this.settings.consumeOnly
        ) {
            return;
        }

        const storageSegments = await this.segmentsStorage.getSegmentsMap(this.masterSwarmId);
        const segmentsMap = this.p2pManager.getOverallSegmentsMap();

        const pendingQueue = this.segmentsQueue.filter(
            (s) =>
                !this.p2pManager.isDownloading(s) &&
                !this.httpManager.isDownloading(s) &&
                !segmentsMap.has(s.id) &&
                !this.httpManager.isFailed(s) &&
                s.priority <= this.settings.httpDownloadMaxPriority &&
                !storageSegments.has(s.id)
        );

        if (pendingQueue.length === 0) {
            return;
        }

        if (Math.random() > this.settings.httpDownloadProbability * pendingQueue.length) {
            return;
        }

        const segment = pendingQueue[Math.floor(Math.random() * pendingQueue.length)];
        this.debugSegments("HTTP download (random)", segment.priority, segment.url);
        this.httpManager.download(segment);
        this.p2pManager.sendSegmentsMapToAll(this.createSegmentsMap(storageSegments));
    };

    private onPieceBytesDownloaded = (method: "http" | "p2p", bytes: number, peerId?: string) => {
        this.bandwidthApproximator.addBytes(bytes, this.now());
        this.emit(Events.PieceBytesDownloaded, method, bytes, peerId);
    };

    private onPieceBytesUploaded = (method: "p2p", bytes: number, peerId?: string) => {
        this.emit(Events.PieceBytesUploaded, method, bytes, peerId);
    };

    private onSegmentLoaded = async (segment: Segment, data: ArrayBuffer, peerId?: string) => {
        this.debugSegments("segment loaded", segment.id, segment.url);

        if (this.masterSwarmId === undefined) {
            return;
        }

        segment.data = data;
        segment.downloadBandwidth = this.bandwidthApproximator.getBandwidth(this.now());

        await this.segmentsStorage.storeSegment(segment);
        this.emit(Events.SegmentLoaded, segment, peerId);

        const storageSegments = await this.segmentsStorage.getSegmentsMap(this.masterSwarmId);

        this.processSegmentsQueue(storageSegments);
        if (!this.settings.consumeOnly) {
            this.p2pManager.sendSegmentsMapToAll(this.createSegmentsMap(storageSegments));
        }
    };

    private onSegmentError = async (segment: Segment, details: unknown, peerId?: string) => {
        this.debugSegments("segment error", segment.id, segment.url, peerId, details);
        this.emit(Events.SegmentError, segment, details, peerId);
        if (this.masterSwarmId !== undefined) {
            const storageSegments = await this.segmentsStorage.getSegmentsMap(this.masterSwarmId);
            if (this.processSegmentsQueue(storageSegments) && !this.settings.consumeOnly) {
                this.p2pManager.sendSegmentsMapToAll(this.createSegmentsMap(storageSegments));
            }
        }
    };

    private getStreamSwarmId = (segment: Segment) => {
        return segment.streamId === undefined ? segment.masterSwarmId : `${segment.masterSwarmId}+${segment.streamId}`;
    };

    private createSegmentsMap = (storageSegments: Map<string, { segment: Segment }>) => {
        const segmentsMap: { [key: string]: [string, number[]] } = {};

        const addSegmentToMap = (segment: Segment, status: MediaPeerSegmentStatus) => {
            const streamSwarmId = this.getStreamSwarmId(segment);
            const segmentId = segment.sequence;

            let segmentsIdsAndStatuses = segmentsMap[streamSwarmId];
            if (segmentsIdsAndStatuses === undefined) {
                segmentsIdsAndStatuses = ["", []];
                segmentsMap[streamSwarmId] = segmentsIdsAndStatuses;
            }
            const segmentsStatuses = segmentsIdsAndStatuses[1];
            segmentsIdsAndStatuses[0] += segmentsStatuses.length === 0 ? segmentId : `|${segmentId}`;
            segmentsStatuses.push(status);
        };

        for (const storageSegment of storageSegments.values()) {
            addSegmentToMap(storageSegment.segment, MediaPeerSegmentStatus.Loaded);
        }

        for (const download of this.httpManager.getActiveDownloads().values()) {
            addSegmentToMap(download.segment, MediaPeerSegmentStatus.LoadingByHttp);
        }

        return segmentsMap;
    };

    private onPeerConnect = async (peer: { id: string }) => {
        this.emit(Events.PeerConnect, peer);
        if (!this.settings.consumeOnly && this.masterSwarmId !== undefined) {
            this.p2pManager.sendSegmentsMap(
                peer.id,
                this.createSegmentsMap(await this.segmentsStorage.getSegmentsMap(this.masterSwarmId))
            );
        }
    };

    private onPeerClose = (peerId: string) => {
        this.emit(Events.PeerClose, peerId);
    };

    private onTrackerUpdate = async (data: { incomplete?: number }) => {
        if (
            this.httpDownloadInitialTimeoutTimestamp !== -Infinity &&
            data.incomplete !== undefined &&
            data.incomplete <= 1
        ) {
            this.debugSegments("cancel initial HTTP download timeout - no peers");

            this.httpDownloadInitialTimeoutTimestamp = -Infinity;

            if (this.masterSwarmId !== undefined) {
                const storageSegments = await this.segmentsStorage.getSegmentsMap(this.masterSwarmId);

                if (this.processSegmentsQueue(storageSegments) && !this.settings.consumeOnly) {
                    this.p2pManager.sendSegmentsMapToAll(this.createSegmentsMap(storageSegments));
                }
            }
        }
    };

    private cleanSegmentsStorage = async (): Promise<boolean> => {
        if (this.masterSwarmId === undefined) {
            return false;
        }

        return this.segmentsStorage.clean(
            this.masterSwarmId,
            (id: string) => this.segmentsQueue.find((queueSegment) => queueSegment.id === id) !== undefined
        );
    };

    private now = () => {
        return performance.now();
    };
}

export interface SegmentsStorage {
    storeSegment: (segment: Segment) => Promise<void>;
    getSegmentsMap: (masterSwarmId: string) => Promise<Map<string, { segment: Segment }>>;
    getSegment: (id: string, masterSwarmId: string) => Promise<Segment | undefined>;
    clean: (masterSwarmId: string, lockedSegmentsFilter?: (id: string) => boolean) => Promise<boolean>;
    destroy: () => Promise<void>;
}

export type SegmentValidatorCallback = (segment: Segment, method: "http" | "p2p", peerId?: string) => Promise<void>;
export type XhrSetupCallback = (xhr: XMLHttpRequest, url: string) => void;
export type SegmentUrlBuilder = (segment: Segment) => string;

export type HybridLoaderSettings = {
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
     * Number of requested peers in each announce for each tracker. Maximum is 10.
     */
    peerRequestsPerAnnounce: number;

    /**
     * An RTCConfiguration dictionary providing options to configure WebRTC connections.
     */
    rtcConfig: RTCConfiguration;

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

    /**
     * A storage for the downloaded segments.
     * By default the segments are stored in JavaScript memory.
     */
    segmentsStorage?: SegmentsStorage;
};
