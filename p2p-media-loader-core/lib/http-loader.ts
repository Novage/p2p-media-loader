import {LoaderInterface, LoaderEvents, Segment} from "./loader-interface";
import SegmentInternal from "./segment-internal";
import {EventEmitter} from "events";
import HttpMediaManager from "./http-media-manager";

export default class HttpLoader extends EventEmitter implements LoaderInterface {

    private segments: Map<string, SegmentInternal> = new Map();
    private httpManager: HttpMediaManager;
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
        this.httpManager.on(LoaderEvents.PieceBytesDownloaded, this.onPieceBytesDownloaded.bind(this));
    }

    public isSupported(): boolean {
        return true;
    }

    public load(segments: Segment[], swarmId: string, emitNowSegmentUrl?: string): void {
        // stop all xhr requests for segments that are not in the new load
        for (const segment of this.segmentsQueue) {
            if (!segments.find((f) => f.url === segment.url)) {
                this.httpManager.abort(segment);
                this.emit(LoaderEvents.SegmentAbort, segment.url);
            }
        }

        // renew segment queue
        this.segmentsQueue = [];
        for (const segment of segments) {
            this.segmentsQueue.push(new SegmentInternal(segment.url, segment.url, segment.priority));
        }

        // emit segment loaded event if the segment has already been downloaded
        if (emitNowSegmentUrl) {
            const downloadedSegment = this.segments.get(emitNowSegmentUrl);
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
        this.segments.clear();
    }

    private processSegmentQueue(): void {
        for (const segment of this.segmentsQueue) {
            if (this.httpManager.getActiveDownloads().size < 1 &&
                    !this.httpManager.isDownloading(segment) &&
                    !this.segments.has(segment.id)) {

                this.httpManager.download(segment);
            }
        }
    }

    private onPieceBytesDownloaded(method: string, size: number): void {
        this.emit(LoaderEvents.PieceBytesDownloaded, method, size);
    }

    private onSegmentLoaded(id: string, url: string, data: ArrayBuffer): void {
        const segment = new SegmentInternal(id, url, 0, data);
        this.segments.set(segment.id, segment);

        this.emitSegmentLoaded(segment);
        this.processSegmentQueue();
    }

    private onSegmentError(url: string, event: any): void {
        this.emit(LoaderEvents.SegmentError, url, event);
        this.processSegmentQueue();
    }

    private emitSegmentLoaded(segmentInternal: SegmentInternal): void {
        segmentInternal.lastAccessed = performance.now();

        const segment = new Segment(segmentInternal.url, 0, segmentInternal.data!);

        this.emit(LoaderEvents.SegmentLoaded, segment);
    }

    private collectGarbage(): void {
        const now = performance.now();

        this.segments.forEach((value, key) => {
            if (now - value.lastAccessed > this.settings.segmentExpiration) {
                this.segments.delete(key);
            }
        });
    }


}
