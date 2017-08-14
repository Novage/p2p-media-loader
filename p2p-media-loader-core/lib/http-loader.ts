import LoaderInterface from "./loader-interface";
import LoaderFile from "./loader-file";
import LoaderEvents from "./loader-events";
import MediaManagerInterface from "./media-manager-interface";
import {EventEmitter} from "events";
import LoaderFileCacheManagerInterface from "./loader-file-cache-manger-interface";
import HttpMediaManager from "./http-media-manager";
import LoaderFileCacheManager from "./loader-file-cache-manager";

export default class HttpLoader extends EventEmitter implements LoaderInterface {

    private cacheManager: LoaderFileCacheManagerInterface;
    private httpManager: MediaManagerInterface;

    private readonly loaderFileExpiration = 1 * 60 * 1000; // milliseconds
    private fileQueue: LoaderFile[] = [];

    public constructor() {
        super();

        this.httpManager = new HttpMediaManager();
        this.httpManager.on(LoaderEvents.FileLoaded, this.onFileLoaded.bind(this));
        this.httpManager.on(LoaderEvents.FileError, this.onFileError.bind(this));

        this.cacheManager = new LoaderFileCacheManager();
    }

    public load(files: LoaderFile[], swarmId: string, emitNowFileUrl?: string): void {

        // stop all xhr requests for files that are not in the new load
        this.fileQueue.forEach((file) => {
            if (files.findIndex((f) => f.url === file.url) === -1) {
                this.httpManager.abort(file);
                this.emit(LoaderEvents.FileAbort, file.url);
            }
        });

        // renew file queue
        this.fileQueue = [...files];

        // emit file loaded event if the file has already been downloaded
        if (emitNowFileUrl) {
            const downloadedFile = this.cacheManager.get(emitNowFileUrl);
            if (downloadedFile) {
                this.emitFileLoaded(downloadedFile);
            }
        }

        // run main processing algorithm
        this.processFileQueue();

        // collect garbage
        this.collectGarbage();
    }

    private processFileQueue(): void {
        this.fileQueue.forEach((file) => {
            if (this.httpManager.getActiveDownloadsCount() < 1 &&
                !this.httpManager.isDownloading(file) &&
                !this.cacheManager.has(file.url)) {

                this.httpManager.download(file);
            }
        });
    }

    private onFileLoaded(file: LoaderFile): void {
        this.cacheManager.set(file.url, file);
        this.emitFileLoaded(file);
        this.processFileQueue();
    }

    private onFileError(url: string, event: any): void {
        this.emit(LoaderEvents.FileError, url, event);
        this.processFileQueue();
    }

    private emitFileLoaded(file: LoaderFile): void {
        this.cacheManager.updateLastAccessed(file.url);
        this.emit(LoaderEvents.FileLoaded, {"url": file.url, "data": file.data.slice(0)});
    }

    private collectGarbage(): void {
        const now = new Date().getTime();
        this.cacheManager.forEach((value, key) => {
            if (now - value.lastAccessed > this.loaderFileExpiration) {
                this.cacheManager.delete(key);
            }
        });
    }


}
