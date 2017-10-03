import LoaderEvents from "./loader-events";
import {EventEmitter} from "events";
import * as Debug from "debug";
import SegmentInternal from "./segment-internal";

export default class HttpMediaManager extends EventEmitter {

    private xhrRequests: Map<string, XMLHttpRequest> = new Map();
    private debug = Debug("p2pml:http-media-manager");

    public constructor() {
        super();
    }

    public download(segment: SegmentInternal): void {
        if (this.isDownloading(segment)) {
            return;
        }
        this.debug("http segment download", segment.url);
        const request = new XMLHttpRequest();
        request.open("GET", segment.url, true);
        request.responseType = "arraybuffer";

        let prevBytesLoaded = 0;
        request.onprogress = (event: any) => {
            const bytesLoaded = event.loaded - prevBytesLoaded;
            this.emit(LoaderEvents.PieceBytesLoaded, "http", bytesLoaded, Date.now());
            prevBytesLoaded = event.loaded;
        };

        request.onload = (event: any) => {
            this.xhrRequests.delete(segment.url);

            if (event.target.status === 200) {
                this.emit(LoaderEvents.SegmentLoaded, segment.id, segment.url, event.target.response);
            } else {
                this.emit(LoaderEvents.SegmentError, segment.url, event);
            }
        };

        request.onerror = (event: any) => {
            // TODO: retry with timeout?
            this.xhrRequests.delete(segment.url);
            this.emit(LoaderEvents.SegmentError, segment.url, event);
        };

        this.xhrRequests.set(segment.url, request);
        request.send();
    }

    public abort(segment: SegmentInternal): void {
        const xhr = this.xhrRequests.get(segment.url);
        if (xhr) {
            xhr.abort();
            this.xhrRequests.delete(segment.url);
            this.debug("http segment abort", segment.url);
        }
    }

    public isDownloading(segment: SegmentInternal): boolean {
        return this.xhrRequests.has(segment.url);
    }

    public getActiveDownloadsCount(): number {
        return this.xhrRequests.size;
    }

    public destroy(): void {
        this.xhrRequests.forEach(xhr => xhr.abort());
        this.xhrRequests.clear();
    }

    setSwarmId(id: string): void {
        throw new Error("Method not implemented.");
    }

}
