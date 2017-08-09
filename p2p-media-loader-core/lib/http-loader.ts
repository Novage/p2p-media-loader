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

    /**
     * Adds files to the download queue.
     * Cancels the download of previous ones if they are not in the new queue.
     * The result of the downloading will be emitted via file_loaded or file_error of {LoaderEvents}.
     *
     * @param {LoaderFile[]} files Files to download.
     */
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

    /**
     * Loops through the files queue and starts file loading. Also saves an instance of XMLHttpRequest of the uploaded file.
     *
     * Starts downloading if:
     * - number of simultaneous downloads not exceeded;
     * - downloading of this file has not started yet;
     * - the file is not in the list of downloaded files.
     */
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

    /**
     * Emits {LoaderEvents.FileLoaded} event with copy of loaded file.
     *
     * @param {LoaderFile} file Input file
     */
    private emitFileLoaded(file: LoaderFile): void {
        // TODO: destructurization
        const fileCopy = new LoaderFile(file.url);
        fileCopy.data = file.data.slice(0);

        this.cacheManager.updateLastAccessed(file.url);
        this.emit(LoaderEvents.FileLoaded, fileCopy);
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
