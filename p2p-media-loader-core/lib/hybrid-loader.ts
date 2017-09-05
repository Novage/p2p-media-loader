import LoaderInterface from "./loader-interface";
import Segment from "./segment";
import LoaderEvents from "./loader-events";
import MediaManagerInterface from "./media-manager-interface";
import SegmentCacheManagerInterface from "./segment-cache-manger-interface";
import SegmentCacheManager from "./segment-cache-manager";
import {EventEmitter} from "events";
import HttpMediaManager from "./http-media-manager";
import P2PMediaManager from "./p2p-media-manager";
import MediaPeerEvents from "./media-peer-events";
import MediaPeer from "./media-peer";
import * as Debug from "debug";
import SegmentInternal from "./segment-internal";

export default class HybridLoader extends EventEmitter implements LoaderInterface {

    private httpManager: MediaManagerInterface;
    private p2pManager: MediaManagerInterface;
    private cacheManager: SegmentCacheManagerInterface;
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

        this.cacheManager = this.createCacheManager();

        this.httpManager = this.createHttpManager();
        this.httpManager.on(LoaderEvents.SegmentLoaded, this.onSegmentLoaded.bind(this));
        this.httpManager.on(LoaderEvents.SegmentError, this.onSegmentError.bind(this));
        this.httpManager.on(LoaderEvents.PieceBytesLoaded, this.onPieceBytesLoaded.bind(this));

        this.p2pManager = this.createP2PManager();
        this.p2pManager.on(LoaderEvents.SegmentLoaded, this.onSegmentLoaded.bind(this));
        this.p2pManager.on(LoaderEvents.SegmentError, this.onSegmentError.bind(this));
        this.p2pManager.on(LoaderEvents.ForceProcessing, this.processSegmentsQueue.bind(this));
        this.p2pManager.on(LoaderEvents.PieceBytesLoaded, this.onPieceBytesLoaded.bind(this));
        this.p2pManager.on(MediaPeerEvents.Connect, this.onPeerConnect.bind(this));
        this.p2pManager.on(MediaPeerEvents.Close, this.onPeerClose.bind(this));
    }

    private createCacheManager() {
        return new SegmentCacheManager();
    }

    private createHttpManager() {
        return new HttpMediaManager();
    }

    private createP2PManager() {
        return new P2PMediaManager(this.cacheManager, this.settings.useP2P ? this.settings.trackerAnnounce : []);
    }

    public load(segments: Segment[], swarmId: string, emitNowSegmentUrl?: string): void {
        this.p2pManager.setSwarmId(swarmId);
        this.debug("load segments", segments, this.segmentsQueue, emitNowSegmentUrl);

        // stop all http requests and p2p downloads for segments that are not in the new load
        this.segmentsQueue.forEach(segment => {
            if (segments.findIndex(f => f.url === segment.url) === -1) {
                this.debug("remove segment", segment.url);
                this.httpManager.abort(segment);
                this.p2pManager.abort(segment);
                this.emit(LoaderEvents.SegmentAbort, segment.url);
            }
        });

        segments.forEach(segment => {
            if (this.segmentsQueue.findIndex(f => f.url === segment.url) === -1) {
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
            const downloadedSegment = this.cacheManager.get(this.settings.segmentIdGenerator(emitNowSegmentUrl));
            if (downloadedSegment) {
                this.debug("emitNowSegmentUrl found in cache");
                this.emitSegmentLoaded(downloadedSegment);
            } else {
                this.debug("emitNowSegmentUrl not found in cache");
            }
        }

        // run main processing algorithm
        this.processSegmentsQueue();

        // collect garbage
        this.collectGarbage();
    }

    public getSettings() {
        return this.settings;
    }

    public destroy(): void {
        this.segmentsQueue = [];
        this.httpManager.destroy();
        this.p2pManager.destroy();
        this.cacheManager.destroy();
    }

    private processSegmentsQueue(): void {
        const startingPriority = this.segmentsQueue.length > 0 ? this.segmentsQueue[0].priority : 0;
        this.debug("processSegmentsQueue - starting priority: " + startingPriority);

        for (let index = 0; index < this.segmentsQueue.length; index++) {
            const segment = this.segmentsQueue[index];
            const segmentPriority = index + startingPriority;
            if (!this.cacheManager.has(segment.id)) {
                if (segmentPriority < this.settings.requiredSegmentsCount) {
                    if (segmentPriority === 0 && !this.httpManager.isDownloading(segment) && this.httpManager.getActiveDownloadsCount() > 0) {
                        this.segmentsQueue.forEach(s => this.httpManager.abort(s));
                    }

                    if (this.httpManager.getActiveDownloadsCount() === 0) {
                        this.p2pManager.abort(segment);
                        this.httpManager.download(segment);
                    }
                } else if (!this.httpManager.isDownloading(segment) && this.p2pManager.getActiveDownloadsCount() < this.settings.simultaneousP2PDownloads) {
                    this.p2pManager.download(segment);
                }
            }

            if (this.httpManager.getActiveDownloadsCount() === 1 && this.p2pManager.getActiveDownloadsCount() === this.settings.simultaneousP2PDownloads) {
                return;
            }
        }


        if (this.httpManager.getActiveDownloadsCount() === 0 && this.p2pManager.getActiveDownloadsCount() === 0) {
            const pendingQueue = this.segmentsQueue.filter(segment =>
                !this.cacheManager.has(segment.id) &&
                !this.httpManager.isDownloading(segment) &&
                !this.p2pManager.isDownloading(segment));
            const downloadedSegmentsCount = this.segmentsQueue.length - pendingQueue.length;

            if (pendingQueue.length > 0 && downloadedSegmentsCount < this.settings.bufferSegmentsCount) {
                let segmentForHttpDownload: SegmentInternal | null = null;

                if (pendingQueue.length === 1 && pendingQueue[0].url === this.segmentsQueue[this.segmentsQueue.length - 1].url) {
                    const now = Date.now();
                    if (now - this.lastSegmentProbabilityTimestamp < this.settings.lastSegmentProbabilityInterval) {
                        return;
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
                }
            }
        }

    }

    private onPieceBytesLoaded(method: string, size: number, timestamp: number): void {
        this.emit(LoaderEvents.PieceBytesLoaded, method, size, timestamp);
    }

    private onSegmentLoaded(id: string, url: string, data: ArrayBuffer): void {
        const segment = new SegmentInternal(id, url);
        segment.data = data;
        this.cacheManager.set(id, segment);

        this.emitSegmentLoaded(segment);
        this.processSegmentsQueue();
    }

    private onSegmentError(url: string, event: any): void {
        this.emit(LoaderEvents.SegmentError, url, event);
        this.processSegmentsQueue();
    }

    private emitSegmentLoaded(segmentInternal: SegmentInternal): void {
        this.cacheManager.updateLastAccessed(segmentInternal.id);

        const segment = new Segment(segmentInternal.url);
        segment.data = segmentInternal.data.slice(0);

        this.emit(LoaderEvents.SegmentLoaded, segment);
        this.debug("emitSegmentLoaded", segment.url);
    }

    private onPeerConnect(mediaPeer: MediaPeer): void {
        this.emit(LoaderEvents.PeerConnect, mediaPeer);
    }

    private onPeerClose(mediaPeer: MediaPeer): void {
        this.emit(LoaderEvents.PeerClose, mediaPeer);
    }

    private collectGarbage(): void {
        const now = new Date().getTime();
        const remainingValues: SegmentInternal[] = [];
        const expiredKeys: string[] = [];

        this.cacheManager.forEach((value, key) => {
            if (now - value.lastAccessed > this.settings.cacheSegmentExpiration) {
                expiredKeys.push(key);
            } else {
                remainingValues.push(value);
            }
        });

        remainingValues.sort((a, b) => {
            return a.lastAccessed - b.lastAccessed;
        });

        const countOverhead = remainingValues.length - this.settings.maxCacheSegmentsCount;
        if (countOverhead > 0) {
            remainingValues.slice(0, countOverhead).forEach(value => expiredKeys.push(value.id));
        }

        this.cacheManager.delete(expiredKeys);
    }

}
