import {LoaderInterface, LoaderEvents, Segment} from "./loader-interface";
import {EventEmitter} from "events";
import HttpMediaManager from "./http-media-manager";
import {P2PMediaManager, P2PMediaManagerEvents} from "./p2p-media-manager";
import {MediaPeerEvents, MediaPeerSegmentStatus} from "./media-peer";
import * as Debug from "debug";
import SegmentInternal from "./segment-internal";

export default class HybridLoader extends EventEmitter implements LoaderInterface {

    private httpManager: HttpMediaManager;
    private p2pManager: P2PMediaManager;
    private segments: Map<string, SegmentInternal> = new Map();
    private segmentsQueue: SegmentInternal[] = [];
    private debug = Debug("p2pml:hybrid-loader");
    private httpDownloadProbabilityTimestamp = -999999;
    private settings = {
        segmentIdGenerator: (url: string): string => url,
        cacheSegmentExpiration: 5 * 60 * 1000, // milliseconds
        maxCacheSegmentsCount: 20,
        requiredSegmentsCount: 2,
        useP2P: true,
        simultaneousP2PDownloads: 3,
        httpDownloadProbability: 0.25,
        httpDownloadProbabilityInterval: 500,
        bufferSegmentsCount: 20,
        trackerAnnounce: [ "wss://tracker.btorrent.xyz/", "wss://tracker.openwebtorrent.com/" ]
    };

    public constructor(settings: any = {}) {
        super();

        this.settings = Object.assign(this.settings, settings);
        this.debug("loader settings", this.settings);

        this.httpManager = this.createHttpManager();
        this.httpManager.on(LoaderEvents.SegmentLoaded, this.onSegmentLoaded.bind(this));
        this.httpManager.on(LoaderEvents.SegmentError, this.onSegmentError.bind(this));
        this.httpManager.on(LoaderEvents.PieceBytesLoaded, this.onPieceBytesLoaded.bind(this));

        this.p2pManager = this.createP2PManager();
        this.p2pManager.on(LoaderEvents.SegmentLoaded, this.onSegmentLoaded.bind(this));
        this.p2pManager.on(LoaderEvents.SegmentError, this.onSegmentError.bind(this));
        this.p2pManager.on(P2PMediaManagerEvents.PeerDataUpdated, this.processSegmentsQueue.bind(this));
        this.p2pManager.on(LoaderEvents.PieceBytesLoaded, this.onPieceBytesLoaded.bind(this));
        this.p2pManager.on(MediaPeerEvents.Connect, this.onPeerConnect.bind(this));
        this.p2pManager.on(MediaPeerEvents.Close, this.onPeerClose.bind(this));
    }

    private createHttpManager() {
        return new HttpMediaManager();
    }

    private createP2PManager() {
        return new P2PMediaManager(this.segments, this.settings.useP2P ? this.settings.trackerAnnounce : []);
    }

    public load(segments: Segment[], swarmId: string, emitNowSegmentUrl?: string): void {
        this.p2pManager.setSwarmId(swarmId);
        this.debug("load segments", segments, this.segmentsQueue, emitNowSegmentUrl);

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
        this.segmentsQueue = [];
        for (const segment of segments) {
            const segmentId = this.settings.segmentIdGenerator(segment.url);
            this.segmentsQueue.push(new SegmentInternal(segmentId, segment.url, segment.priority));
        }

        // emit segment loaded event if the segment has already been downloaded
        if (emitNowSegmentUrl) {
            const downloadedSegment = this.segments.get(this.settings.segmentIdGenerator(emitNowSegmentUrl));
            if (downloadedSegment) {
                this.debug("emitNowSegmentUrl found in cache");
                this.emitSegmentLoaded(downloadedSegment);
            } else {
                this.debug("emitNowSegmentUrl not found in cache");
            }
        }

        // run main processing algorithm
        updateSegmentsMap = this.processSegmentsQueue() || updateSegmentsMap;

        // collect garbage
        updateSegmentsMap = this.collectGarbage() || updateSegmentsMap;

        if (updateSegmentsMap) {
            this.p2pManager.sendSegmentsMapToAll(this.createSegmentsMap());
        }
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
                if (segmentPriority < this.settings.requiredSegmentsCount) {
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
                } else if (!this.httpManager.isDownloading(segment) && this.p2pManager.getActiveDownloadsCount() < this.settings.simultaneousP2PDownloads && downloadedSegmentsCount < this.settings.bufferSegmentsCount) {
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

        const now = performance.now();
        if (now - this.httpDownloadProbabilityTimestamp < this.settings.httpDownloadProbabilityInterval) {
            return updateSegmentsMap;
        } else {
            this.httpDownloadProbabilityTimestamp = now;
        }

        let pendingQueue = this.segmentsQueue.filter(segment =>
            !this.segments.has(segment.id) &&
            !this.p2pManager.isDownloading(segment));
        downloadedSegmentsCount = this.segmentsQueue.length - pendingQueue.length;

        if (pendingQueue.length == 0 || downloadedSegmentsCount >= this.settings.bufferSegmentsCount) {
            return updateSegmentsMap;
        }

        const segmentsMap = this.p2pManager.getOvrallSegmentsMap();
        pendingQueue = pendingQueue.filter(segment => !segmentsMap.get(segment.id));

        if (pendingQueue.length == 0) {
            return updateSegmentsMap;
        }

        if (Math.random() <= this.settings.httpDownloadProbability) {
            const random_index = Math.floor(Math.random() * Math.min(pendingQueue.length, this.settings.bufferSegmentsCount));
            const segment = pendingQueue[random_index];
            this.debug("HTTP download (random)", segment.priority, segment.url);
            this.httpManager.download(segment);
            updateSegmentsMap = true;
        }

        return updateSegmentsMap;
    }

    private onPieceBytesLoaded(method: string, size: number): void {
        this.emit(LoaderEvents.PieceBytesLoaded, method, size);
    }

    private onSegmentLoaded(id: string, url: string, data: ArrayBuffer): void {
        const segment = new SegmentInternal(id, url, 0, data);
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
        segmentInternal.lastAccessed = performance.now();

        const segment = new Segment(segmentInternal.url, 0, segmentInternal.data!);

        this.emit(LoaderEvents.SegmentLoaded, segment);
        this.debug("emitSegmentLoaded", segment.url);
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
        const now = performance.now();
        const remainingValues: SegmentInternal[] = [];
        const expiredKeys: string[] = [];

        this.segments.forEach((value, key) => {
            if (now - value.lastAccessed > this.settings.cacheSegmentExpiration) {
                expiredKeys.push(key);
            } else {
                remainingValues.push(value);
            }
        });

        remainingValues.sort((a, b) => a.lastAccessed - b.lastAccessed);

        const countOverhead = remainingValues.length - this.settings.maxCacheSegmentsCount;
        if (countOverhead > 0) {
            remainingValues.slice(0, countOverhead).forEach(value => expiredKeys.push(value.id));
        }

        expiredKeys.forEach(key => this.segments.delete(key));

        return expiredKeys.length > 0;
    }

}
