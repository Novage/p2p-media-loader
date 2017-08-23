import LoaderInterface from "./loader-interface";
import Segment from "./segment";
import SegmentInternal from "./segment-internal";
import LoaderEvents from "./loader-events";
import MediaManagerInterface from "./media-manager-interface";
import {EventEmitter} from "events";
import SegmentCacheManagerInterface from "./segment-cache-manger-interface";
import SegmentCacheManager from "./segment-cache-manager";
import HttpMediaManager from "./http-media-manager";

export default class HttpLoader extends EventEmitter implements LoaderInterface {

    private cacheManager: SegmentCacheManagerInterface;
    private httpManager: MediaManagerInterface;
    private segmentsQueue: SegmentInternal[] = [];
    private settings = {
        segmentExpiration: 5 * 60 * 1000, // milliseconds
    };

    public constructor(settings: any = {}) {
        super();

        this.settings = Object.assign(this.settings, settings);

        this.httpManager = new HttpMediaManager();
        this.httpManager.on(LoaderEvents.SegmentLoaded, this.onSegmentLoaded.bind(this));
        this.httpManager.on(LoaderEvents.SegmentError, this.onSegmentError.bind(this));

        this.cacheManager = new SegmentCacheManager();
    }

    public load(segments: Segment[], swarmId: string, emitNowSegmentUrl?: string): void {

        // stop all xhr requests for segments that are not in the new load
        this.segmentsQueue.forEach((segment) => {
            if (segments.findIndex((f) => f.url === segment.url) === -1) {
                this.httpManager.abort(segment);
                this.emit(LoaderEvents.SegmentAbort, segment.url);
            }
        });

        // renew segment queue
        this.segmentsQueue = [];
        segments.forEach(segment => {
            this.segmentsQueue.push(new SegmentInternal(segment.url, segment.url, segment.priority));
        });

        // emit segment loaded event if the segment has already been downloaded
        if (emitNowSegmentUrl) {
            const downloadedSegment = this.cacheManager.get(emitNowSegmentUrl);
            if (downloadedSegment) {
                this.emitSegmentLoaded(downloadedSegment);
            }
        }

        // run main processing algorithm
        this.processSegmentQueue();

        // collect garbage
        this.collectGarbage();
    }

    public getSettings() {
        return this.settings;
    }

    public destroy(): void {
        this.segmentsQueue = [];
        this.httpManager.destroy();
    }

    private processSegmentQueue(): void {
        this.segmentsQueue.forEach((segment) => {
            if (this.httpManager.getActiveDownloadsCount() < 1 &&
                !this.httpManager.isDownloading(segment) &&
                !this.cacheManager.has(segment.id)) {

                this.httpManager.download(segment);
            }
        });
    }

    private onSegmentLoaded(url: string, data: ArrayBuffer): void {
        const segment = new SegmentInternal(url, url);
        segment.data = data;
        this.cacheManager.set(segment.id, segment);

        this.emitSegmentLoaded(segment);
        this.processSegmentQueue();
    }

    private onSegmentError(url: string, event: any): void {
        this.emit(LoaderEvents.SegmentError, url, event);
        this.processSegmentQueue();
    }

    private emitSegmentLoaded(segmentInternal: SegmentInternal): void {
        this.cacheManager.updateLastAccessed(segmentInternal.id);

        const segment = new Segment(segmentInternal.url);
        segment.data = segment.data.slice(0);
        this.emit(LoaderEvents.SegmentLoaded, segment);
    }

    private collectGarbage(): void {
        const now = new Date().getTime();
        const keys: string[] = [];

        this.cacheManager.forEach((value, key) => {
            if (now - value.lastAccessed > this.settings.segmentExpiration) {
                keys.push(key);
            }
        });

        this.cacheManager.delete(keys);
    }


}
