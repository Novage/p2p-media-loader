import MediaManagerInterface from "./media-manager-interface";
import LoaderFile from "./loader-file";
import LoaderEvents from "./loader-events";
import {EventEmitter} from "events";

export default class HttpMediaManager extends EventEmitter implements MediaManagerInterface {

    private xhrRequests: Map<string, XMLHttpRequest> = new Map();

    public constructor() {
        super();
    }

    public download(file: LoaderFile): void {
        if (this.isDownloading(file)) {
            return;
        }
        const request = new XMLHttpRequest();
        request.open("GET", file.url, true);
        request.responseType = "arraybuffer";

        let bytesLoaded = 0;
        request.onprogress = (event: any) => {
            bytesLoaded = event.loaded - bytesLoaded;
            this.emit(LoaderEvents.ChunkBytesLoaded, {"method": "http", "size": bytesLoaded, timestamp: Date.now()});
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
