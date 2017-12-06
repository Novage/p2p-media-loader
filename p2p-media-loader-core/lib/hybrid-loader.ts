import {LoaderInterface, LoaderEvents, Segment} from "./loader-interface";
import {EventEmitter} from "events";
import HttpMediaManager from "./http-media-manager";
import {P2PMediaManager, P2PMediaManagerEvents} from "./p2p-media-manager";
import {MediaPeerEvents, MediaPeerSegmentStatus} from "./media-peer";
import * as Debug from "debug";
import SegmentInternal from "./segment-internal";
import {SpeedApproximator} from "./speed-approximator";

const getBrowserRtc = require("get-browser-rtc");

export default class HybridLoader extends EventEmitter implements LoaderInterface {

    private httpManager: HttpMediaManager;
    private p2pManager: P2PMediaManager;
    private segments: Map<string, SegmentInternal> = new Map();
    private segmentsQueue: Segment[] = [];
    private debug = Debug("p2pml:hybrid-loader");
    private httpDownloadProbabilityTimestamp = -999999;
    private speedApproximator = new SpeedApproximator();

    private settings = {
        cachedSegmentExpiration: 5 * 60 * 1000, // milliseconds
        cachedSegmentsCount: 30,

        useP2P: true,
        requiredSegmentsPriority: 1,
        simultaneousP2PDownloads: 3,
        httpDownloadProbability: 0.06,
        httpDownloadProbabilityInterval: 500,
        bufferedSegmentsCount: 20,

        webRtcMaxMessageSize: 16 * 1024,
        p2pSegmentDownloadTimeout: 60000,

        trackerAnnounce: [ "wss://tracker.btorrent.xyz/", "wss://tracker.openwebtorrent.com/" ]
    };

    public static isSupported(): boolean {
        const browserRtc = getBrowserRtc();
        return (browserRtc && (browserRtc.RTCPeerConnection.prototype.createDataChannel !== undefined));
    }

    public isSupported(): boolean {
        return HybridLoader.isSupported();
    }

    public constructor(settings: any = {}) {
        super();

        this.settings = Object.assign(this.settings, settings);
        this.debug("loader settings", this.settings);

        this.httpManager = this.createHttpManager();
        this.httpManager.on(LoaderEvents.SegmentLoaded, this.onSegmentLoaded.bind(this));
        this.httpManager.on(LoaderEvents.SegmentError, this.onSegmentError.bind(this));
        this.httpManager.on(LoaderEvents.PieceBytesDownloaded, this.onPieceBytesDownloaded.bind(this));

        this.p2pManager = this.createP2PManager();
        this.p2pManager.on(LoaderEvents.SegmentLoaded, this.onSegmentLoaded.bind(this));
        this.p2pManager.on(LoaderEvents.SegmentError, this.onSegmentError.bind(this));
        this.p2pManager.on(P2PMediaManagerEvents.PeerDataUpdated, this.processSegmentsQueue.bind(this));
        this.p2pManager.on(LoaderEvents.PieceBytesDownloaded, this.onPieceBytesDownloaded.bind(this));
        this.p2pManager.on(LoaderEvents.PieceBytesUploaded, this.onPieceBytesUploaded.bind(this));
        this.p2pManager.on(MediaPeerEvents.Connect, this.onPeerConnect.bind(this));
        this.p2pManager.on(MediaPeerEvents.Close, this.onPeerClose.bind(this));
    }

    private createHttpManager() {
        return new HttpMediaManager();
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
                this.emit(LoaderEvents.SegmentAbort, segment.url);
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
        return segment ? (segment.data ? new Segment(segment.id, segment.url, segment.priority, segment.data, segment.downloadSpeed) : undefined) : undefined;
    }

    public getSettings() {
        return this.settings;
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
                    if (segmentPriority == 0 && !this.httpManager.isDownloading(segment) && this.httpManager.getActiveDownloads().size > 0) {
                        for (const s of this.segmentsQueue) {
                            this.httpManager.abort(s);
                            updateSegmentsMap = true;
                        }
                    }

                    if (this.httpManager.getActiveDownloads().size == 0) {
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

            if (this.httpManager.getActiveDownloads().size == 1 && this.p2pManager.getActiveDownloadsCount() == this.settings.simultaneousP2PDownloads) {
                return updateSegmentsMap;
            }
        }

        if (this.httpManager.getActiveDownloads().size > 0) {
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

    private onPieceBytesDownloaded(method: string, size: number): void {
        this.speedApproximator.addBytes(size, this.now());
        this.emit(LoaderEvents.PieceBytesDownloaded, method, size);
    }

    private onPieceBytesUploaded(method: string, size: number): void {
        this.speedApproximator.addBytes(size, this.now());
        this.emit(LoaderEvents.PieceBytesUploaded, method, size);
    }

    private onSegmentLoaded(id: string, url: string, data: ArrayBuffer): void {
        this.debug("segment loaded", id, url);
        const segment = new SegmentInternal(id, url, 0, data, this.speedApproximator.getSpeed(this.now()));
        this.segments.set(id, segment);
        this.emitSegmentLoaded(segment);
        this.processSegmentsQueue();
        this.p2pManager.sendSegmentsMapToAll(this.createSegmentsMap());
    }

    private onSegmentError(url: string, event: any): void {
        this.emit(LoaderEvents.SegmentError, url, event);
        this.processSegmentsQueue();
    }

    private emitSegmentLoaded(segmentInternal: SegmentInternal): void {
        segmentInternal.lastAccessed = this.now();

        const segment = new Segment(segmentInternal.id, segmentInternal.url, 0, segmentInternal.data, segmentInternal.downloadSpeed);

        this.emit(LoaderEvents.SegmentLoaded, segment);
    }

    private createSegmentsMap(): string[][] {
        const segmentsMap: string[][] = [];
        this.segments.forEach((value, key) => segmentsMap.push([key, MediaPeerSegmentStatus.Loaded]));
        this.httpManager.getActiveDownloads().forEach((value, key) => segmentsMap.push([key, MediaPeerSegmentStatus.LoadingByHttp]));
        return segmentsMap;
    }

    private onPeerConnect(peer: {id: string}): void {
        this.p2pManager.sendSegmentsMap(peer.id, this.createSegmentsMap());
        this.emit(LoaderEvents.PeerConnect, peer);
    }

    private onPeerClose(peerId: string): void {
        this.emit(LoaderEvents.PeerClose, peerId);
    }

    private collectGarbage(): boolean {
        const segmentsToDelete: string[] = [];
        const remainingSegments: SegmentInternal[] = [];

        // Delete old segments
        const now = this.now();
        this.segments.forEach(segment => {
            if (now - segment.lastAccessed > this.settings.cachedSegmentExpiration) {
                segmentsToDelete.push(segment.id);
            } else {
                remainingSegments.push(segment);
            }
        });

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
}
