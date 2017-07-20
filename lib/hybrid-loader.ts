import LoaderInterface from "./loader-interface";
import LoaderFile from "./loader-file";
import LoaderEvents from "./loader-events";
import MediaManagerInterface from "./media-manager-interface";
import LoaderFileCacheManagerInterface from "./loader-file-cache-manger-interface";
import {EventEmitter} from "events";

export default class HybridLoader extends EventEmitter implements LoaderInterface {

    private httpManager: MediaManagerInterface;
    private p2pManager: MediaManagerInterface;
    private cacheManager: LoaderFileCacheManagerInterface;

    private readonly requiredFilesCount = 2;
    private readonly bufferFilesCount = 1;
    private readonly downloadedFileExpiration = 2 * 60 * 1000; // milliseconds
    private fileQueue: LoaderFile[] = [];

    public constructor(httpManager: MediaManagerInterface, p2pManager: MediaManagerInterface,
                       cacheManager: LoaderFileCacheManagerInterface) {
        super();

        this.httpManager = httpManager;
        httpManager.on(LoaderEvents.FileLoaded, this.onFileLoaded.bind(this));
        httpManager.on(LoaderEvents.FileError, this.onFileError.bind(this));

        this.p2pManager = p2pManager;
        p2pManager.on(LoaderEvents.FileLoaded, this.onFileLoaded.bind(this));
        p2pManager.on(LoaderEvents.FileError, this.onFileError.bind(this));

        this.cacheManager = cacheManager;
    }

    load(files: LoaderFile[], playlistUrl: string): void {

        this.p2pManager.setPlaylistUrl(playlistUrl);

        // stop all http requests and p2p downloads for files that are not in the new load
        this.fileQueue.forEach(file => {
            if (files.findIndex(f => f.url === file.url) === -1) {
                this.httpManager.abort(file);
                this.p2pManager.abort(file);
            }
        });

        // renew file queue
        this.fileQueue = [...files];

        // emit file loaded event if the file has already been downloaded
        this.fileQueue.forEach(file => {
            const downloadedFile = this.cacheManager.get(file.url);
            if (downloadedFile) {
                this.emitFileLoaded(downloadedFile);
            }
        });

        // run main processing algorithm
        this.processFileQueue();
        this.cacheManager.collectGarbage();
    }

    private processFileQueue(): void {
        for (let i = 0; i < this.fileQueue.length; i++) {
            const file = this.fileQueue[i];
            if (!this.cacheManager.has(file.url)) {
                if (i < this.requiredFilesCount) {
                    // force load required files via http
                    this.p2pManager.abort(file);
                    this.httpManager.download(file);
                } else if (!this.httpManager.isDownloading(file)) {
                    // try load files via p2p if http loading is not started
                    this.p2pManager.download(file);
                }
            }
        }



        // load random file to buffer
        const pendingQueue = this.fileQueue.filter(file =>
            !this.cacheManager.has(file.url) &&
            !this.httpManager.isDownloading(file) &&
            !this.p2pManager.isDownloading(file));

        /*if (pendingQueue.length > 0 && this.httpManager.getActiveDownloadsCount() <= this.requiredFilesCount + this.bufferFilesCount) {
            const random_index = Math.floor(Math.random() * pendingQueue.length);
            this.httpManager.download(pendingQueue[random_index]);
        }*/
    }

    private onFileLoaded(file: LoaderFile): void {
        this.cacheManager.set(file.url, file);
        this.emitFileLoaded(file);
        this.processFileQueue();
    }

    private onFileError(url: string, event: any): void {
        this.emit(LoaderEvents.FileLoaded, url, event);
        this.processFileQueue();
    }

    private emitFileLoaded(file: LoaderFile): void {
        const fileCopy = new LoaderFile(file.url);
        fileCopy.data = file.data.slice(0);

        this.cacheManager.updateLastAccessed(file.url);
        this.emit(LoaderEvents.FileLoaded, fileCopy);
    }

}
