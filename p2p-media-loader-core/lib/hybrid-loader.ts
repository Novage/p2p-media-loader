import {LoaderInterface, LoaderEvents, Segment} from "./loader-interface";
import {EventEmitter} from "events";
import HttpMediaManager from "./http-media-manager";
import {P2PMediaManager, P2PMediaManagerEvents} from "./p2p-media-manager";
import {MediaPeerEvents, SegmentStatus} from "./media-peer";
import * as Debug from "debug";
import SegmentInternal from "./segment-internal";

export default class HybridLoader extends EventEmitter implements LoaderInterface {

    private httpManager: HttpMediaManager;
    private p2pManager: P2PMediaManager;
    private segments: Map<string, SegmentInternal> = new Map();
    private segmentsQueue: SegmentInternal[] = [];
    private debug = Debug("p2pml:hybrid-loader");
    private lastSegmentProbabilityTimestamp = 0;
    private settings = {
        segmentIdGenerator: (url: string): string => url,
        cacheSegmentExpiration: 5 * 60 * 1000, // milliseconds
        maxCacheSegmentsCount: 20,
        requiredSegmentsCount: 2,
        useP2P: true,
        simultaneousP2PDownloads: 3,
        lastSegmentProbability: 0.05,
        lastSegmentProbabilityInterval: 1000,
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
        this.segmentsQueue.forEach(segment => {
            if (segments.findIndex(f => f.url == segment.url) == -1) {
                this.debug("remove segment", segment.url);
                if (this.httpManager.isDownloading(segment)) {
                    updateSegmentsMap = true;
                    this.httpManager.abort(segment);
                } else {
                    this.p2pManager.abort(segment);
                }
                this.emit(LoaderEvents.SegmentAbort, segment.url);
            }
        });

        segments.forEach(segment => {
            if (!this.segmentsQueue.find(f => f.url == segment.url)) {
                this.debug("add segment", segment.url);
            }
        });

        // renew segment queue
        this.segmentsQueue = [];
        segments.forEach(segment => {
            const segmentId = this.settings.segmentIdGenerator(segment.url);
            this.segmentsQueue.push(new SegmentInternal(segmentId, segment.url, segment.priority));
        });

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

        let pendingQueue = this.segmentsQueue.filter(segment =>
            !this.segments.has(segment.id) &&
            !this.httpManager.isDownloading(segment) &&
            !this.p2pManager.isDownloading(segment));

        if (pendingQueue.length == 0) {
            return false;
        }

        let downloadedSegmentsCount = this.segmentsQueue.length - pendingQueue.length;
        let updateSegmentsMap = false;

        for (let index = 0; index < this.segmentsQueue.length; index++) {
            const segment = this.segmentsQueue[index];
            const segmentPriority = index + startingPriority;

            if (!this.segments.has(segment.id)) {
                if (segmentPriority < this.settings.requiredSegmentsCount) {
                    if (segmentPriority == 0 && !this.httpManager.isDownloading(segment) && this.httpManager.getActiveDownloads().size > 0) {
                        this.segmentsQueue.forEach(s => {
                                this.httpManager.abort(s);
                                updateSegmentsMap = true;
                            });
                    }

                    if (this.httpManager.getActiveDownloads().size == 0) {
                        this.p2pManager.abort(segment);
                        this.httpManager.download(segment);
                        updateSegmentsMap = true;
                    }
                } else if (!this.httpManager.isDownloading(segment) && this.p2pManager.getActiveDownloadsCount() < this.settings.simultaneousP2PDownloads && downloadedSegmentsCount < this.settings.bufferSegmentsCount) {
                    this.p2pManager.download(segment);
                }
            }

            if (this.httpManager.getActiveDownloads().size == 1 && this.p2pManager.getActiveDownloadsCount() == this.settings.simultaneousP2PDownloads) {
                return updateSegmentsMap;
            }
        }

        if (this.httpManager.getActiveDownloads().size > 0 || this.p2pManager.getActiveDownloadsCount() >= this.settings.simultaneousP2PDownloads) {
            return updateSegmentsMap;
        }

        pendingQueue = this.segmentsQueue.filter(segment =>
            !this.segments.has(segment.id) &&
            !this.p2pManager.isDownloading(segment));
        downloadedSegmentsCount = this.segmentsQueue.length - pendingQueue.length;

        if (pendingQueue.length == 0 || downloadedSegmentsCount >= this.settings.bufferSegmentsCount) {
            return updateSegmentsMap;
        }

        let segmentForHttpDownload: SegmentInternal | null = null;

        if (pendingQueue.length == 1 && pendingQueue[0].url == this.segmentsQueue[this.segmentsQueue.length - 1].url) {
            const now = Date.now();
            if (now - this.lastSegmentProbabilityTimestamp < this.settings.lastSegmentProbabilityInterval) {
                return updateSegmentsMap;
            }

            this.lastSegmentProbabilityTimestamp = now;
            if (Math.random() <= this.settings.lastSegmentProbability) {
                segmentForHttpDownload = pendingQueue[0];
            }
        } else {
            const random_index = Math.floor(Math.random() * Math.min(pendingQueue.length, this.settings.bufferSegmentsCount));
            segmentForHttpDownload = pendingQueue[random_index];
        }

        if (segmentForHttpDownload) {
            this.debug("Random HTTP download:");
            this.httpManager.download(segmentForHttpDownload);
            updateSegmentsMap = true;
        }

        return updateSegmentsMap;
    }

    private onPieceBytesLoaded(method: string, size: number, timestamp: number): void {
        this.emit(LoaderEvents.PieceBytesLoaded, method, size, timestamp);
    }

    private onSegmentLoaded(id: string, url: string, data: ArrayBuffer): void {
        const segment = new SegmentInternal(id, url);
        segment.data = data;
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
        segmentInternal.lastAccessed = new Date().getTime();

        const segment = new Segment(segmentInternal.url);
        segment.data = segmentInternal.data.slice(0);

        this.emit(LoaderEvents.SegmentLoaded, segment);
        this.debug("emitSegmentLoaded", segment.url);
    }

    private createSegmentsMap(): string[][] {
        const segmentsMap: string[][] = [];
        this.segments.forEach((value, key) => segmentsMap.push([key, SegmentStatus.Loaded]));
        this.httpManager.getActiveDownloads().forEach((value, key) => segmentsMap.push([key, SegmentStatus.LoadingByHttp]));
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
        const now = new Date().getTime();
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
