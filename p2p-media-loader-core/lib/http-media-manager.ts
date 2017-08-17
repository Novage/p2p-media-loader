import MediaManagerInterface from "./media-manager-interface";
import LoaderFile from "./loader-file";
import LoaderEvents from "./loader-events";
import {EventEmitter} from "events";
import * as Debug from "debug";

export default class HttpMediaManager extends EventEmitter implements MediaManagerInterface {

    private xhrRequests: Map<string, XMLHttpRequest> = new Map();
    private debug = Debug("p2ml:http-media-manager");

    public constructor() {
        super();
    }

    public download(file: LoaderFile): void {
        if (this.isDownloading(file)) {
            return;
        }
        this.debug("http file download", file.url);
        const request = new XMLHttpRequest();
        request.open("GET", file.url, true);
        request.responseType = "arraybuffer";

        let prevBytesLoaded = 0;
        request.onprogress = (event: any) => {
            const bytesLoaded = event.loaded - prevBytesLoaded;
            this.emit(LoaderEvents.ChunkBytesLoaded, {"method": "http", "size": bytesLoaded, timestamp: Date.now()});
            prevBytesLoaded = event.loaded;
        };

        request.onload = (event: any) => {
            this.xhrRequests.delete(file.url);

            if (event.target.status === 200) {
                file.data = event.target.response;
                this.emit(LoaderEvents.FileLoaded, file);
            } else {
                this.emit(LoaderEvents.FileError, file.url, event);
            }
        };

        request.onerror = (event: any) => {
            // TODO: retry with timeout?
            this.xhrRequests.delete(file.url);
            this.emit(LoaderEvents.FileError, file.url, event);
        };

        this.xhrRequests.set(file.url, request);
        request.send();
    }

    public abort(file: LoaderFile): void {
        const xhr = this.xhrRequests.get(file.url);
        if (xhr) {
            xhr.abort();
            this.xhrRequests.delete(file.url);
            this.debug("http file abort", file.url);
        }
    }

    public isDownloading(file: LoaderFile): boolean {
        return this.xhrRequests.has(file.url);
    }

    public getActiveDownloadsCount(): number {
        return this.xhrRequests.size;
    }

    setSwarmId(id: string): void {
        throw new Error("Method not implemented.");
    }

}
