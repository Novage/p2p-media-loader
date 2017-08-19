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

export default class HybridLoader extends EventEmitter implements LoaderInterface {

    private httpManager: MediaManagerInterface;
    private p2pManager: MediaManagerInterface;
    private cacheManager: SegmentCacheManagerInterface;
    private readonly segmentExpiration = 5 * 60 * 1000; // milliseconds
    private readonly requiredSegmentsCount = 2;
    private readonly lastSegmentProbability = 0.1;
    private readonly bufferSegmentsCount = 20;
    private segmentsQueue: Segment[] = [];
    private debug = Debug("p2pml:hybrid-loader");

    public constructor(settings: any = {}) {
        super();
        this.cacheManager = new SegmentCacheManager();
        this.httpManager = new HttpMediaManager();
        this.httpManager.on(LoaderEvents.SegmentLoaded, this.onSegmentLoaded.bind(this));
        this.httpManager.on(LoaderEvents.SegmentError, this.onSegmentError.bind(this));
        this.httpManager.on(LoaderEvents.PieceBytesLoaded, this.onPieceBytesLoaded.bind(this));

        this.p2pManager = new P2PMediaManager(this.cacheManager);
        this.p2pManager.on(LoaderEvents.SegmentLoaded, this.onSegmentLoaded.bind(this));
        this.p2pManager.on(LoaderEvents.SegmentError, this.onSegmentError.bind(this));
        this.p2pManager.on(LoaderEvents.ForceProcessing, this.processSegmentsQueue.bind(this));
        this.p2pManager.on(LoaderEvents.PieceBytesLoaded, this.onPieceBytesLoaded.bind(this));
        this.p2pManager.on(MediaPeerEvents.Connect, this.onPeerConnect.bind(this));
        this.p2pManager.on(MediaPeerEvents.Close, this.onPeerClose.bind(this));

        //setInterval(() => {
            //this.processSegmentsQueue();
        //}, 1000);
    }

    load(segments: Segment[], swarmId: string, emitNowSegmentUrl?: string): void {
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
            this.segmentsQueue.push(new Segment(segment.url, segment.priority));
        });

        this.segmentsQueue = [...segments];

        // emit segment loaded event if the segment has already been downloaded
        if (emitNowSegmentUrl) {
            const downloadedSegment = this.cacheManager.get(emitNowSegmentUrl);
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

    public destroy(): void {
        // todo: add destroy logic here; after this call, the object should not use network or emit any events
    }

    private processSegmentsQueue(): void {
        const startingPriority = this.segmentsQueue.length > 0 ? this.segmentsQueue[0].priority : 0;
        this.debug("processSegmentsQueue - starting priority: " + startingPriority);

        for (let index = 0; index < this.segmentsQueue.length; index++) {
            const segment = this.segmentsQueue[index];
            const segmentPriority = index + startingPriority;
            if (!this.cacheManager.has(segment.url)) {
                if (segmentPriority < this.requiredSegmentsCount) {
                    if (segmentPriority === 0 && !this.httpManager.isDownloading(segment) && this.httpManager.getActiveDownloadsCount() > 0) {
                        this.segmentsQueue.forEach(s => this.httpManager.abort(s));
                    }

                    if (this.httpManager.getActiveDownloadsCount() === 0) {
                        this.p2pManager.abort(segment);
                        this.httpManager.download(segment);
                    }
                } else if (!this.httpManager.isDownloading(segment) && this.p2pManager.getActiveDownloadsCount() < 3) {
                    this.p2pManager.download(segment);
                }
            }

            if (this.httpManager.getActiveDownloadsCount() === 1 && this.p2pManager.getActiveDownloadsCount() === 3) {
                return;
            }
        }


        if (this.httpManager.getActiveDownloadsCount() === 0 && this.p2pManager.getActiveDownloadsCount() === 0) {
            const pendingQueue = this.segmentsQueue.filter(segment =>
                !this.cacheManager.has(segment.url) &&
                !this.httpManager.isDownloading(segment) &&
                !this.p2pManager.isDownloading(segment));
            const downloadedSegmentsCount = this.segmentsQueue.length - pendingQueue.length;

            if (pendingQueue.length > 0 && downloadedSegmentsCount < this.bufferSegmentsCount) {
                let segmentForHttpDownload: Segment | null = null;

                if (pendingQueue.length === 1 && pendingQueue[0].url === this.segmentsQueue[this.segmentsQueue.length - 1].url) {
                    if (Math.random() <= this.lastSegmentProbability) {
                        segmentForHttpDownload = pendingQueue[0];
                    }
                } else {
                    const random_index = Math.floor(Math.random() * Math.min(pendingQueue.length, this.bufferSegmentsCount));
                    segmentForHttpDownload = pendingQueue[random_index];
                }

                if (segmentForHttpDownload) {
                    this.debug("Random HTTP download:");
                    this.httpManager.download(segmentForHttpDownload);
                }
            }
        }

    }

    private onPieceBytesLoaded(data: any): void {
        this.emit(LoaderEvents.PieceBytesLoaded, data);
    }

    private onSegmentLoaded(segment: Segment): void {
        this.cacheManager.set(segment.url, segment);
        this.emitSegmentLoaded(segment);
        this.processSegmentsQueue();
    }

    private onSegmentError(url: string, event: any): void {
        this.emit(LoaderEvents.SegmentError, url, event);
        this.processSegmentsQueue();
    }

    private emitSegmentLoaded(segment: Segment): void {
        this.cacheManager.updateLastAccessed(segment.url);
        this.emit(LoaderEvents.SegmentLoaded, {"url": segment.url, "data": segment.data.slice(0)});
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
        const keys: string[] = [];

        this.cacheManager.forEach((value, key) => {
            if (now - value.lastAccessed > this.segmentExpiration) {
                keys.push(key);
            }
        });

        this.cacheManager.delete(keys);
    }

}
