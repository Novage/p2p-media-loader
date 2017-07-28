import LoaderInterface from "./loader-interface";
import LoaderFile from "./loader-file";
import LoaderEvents from "./loader-events";
import MediaManagerInterface from "./media-manager-interface";
import LoaderFileCacheManagerInterface from "./loader-file-cache-manger-interface";
import {EventEmitter} from "events";
import {setInterval} from "timers";

export default class HybridLoader extends EventEmitter implements LoaderInterface {

    private httpManager: MediaManagerInterface;
    private p2pManager: MediaManagerInterface;
    private cacheManager: LoaderFileCacheManagerInterface;

    private readonly loaderFileExpiration = 1 * 60 * 1000; // milliseconds
    private readonly requiredFilesCount = 2;
    private readonly bufferFilesCount = 3;
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
        p2pManager.on(LoaderEvents.ForceProcessing, this.processFileQueue.bind(this));

        this.cacheManager = cacheManager;

        setInterval(() => {
            this.processFileQueue();
        }, 1000);
    }

    load(files: LoaderFile[], emitNowFileUrl: string, playlistUrl: string): void {
        //console.log("load()", files.length, (files.length > 0 ? files[0].url : ""));
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
        const downloadedFile = this.cacheManager.get(emitNowFileUrl);
        if (downloadedFile) {
            this.emitFileLoaded(downloadedFile);
        }

        // run main processing algorithm
        this.processFileQueue();

        // collect garbage
        //this.collectGarbage();
    }

    private processFileQueue(): void {
        for (let i = 0; i < this.fileQueue.length; i++) {
            const file = this.fileQueue[i];
            if (!this.cacheManager.has(file.url)) {
                if (i < this.requiredFilesCount) {
                    // first file is urgent so stop all other http requests
                    if (i === 0 && !this.httpManager.isDownloading(file) && this.httpManager.getActiveDownloadsCount() > 0) {
                        this.fileQueue.forEach(file => this.httpManager.abort(file));
                    }

                    if (this.httpManager.getActiveDownloadsCount() === 0) {
                        this.p2pManager.abort(file);
                        this.httpManager.download(file);
                    }
                } else if (!this.httpManager.isDownloading(file) && this.p2pManager.getActiveDownloadsCount() < 3) {
                    this.p2pManager.download(file);
                }

                /*if (this.httpManager.getActiveDownloadsCount() < 1) {
                    this.httpManager.download(file);
                }*/

                /*if (this.p2pManager.getActiveDownloadsCount() === 0 && this.httpManager.getActiveDownloadsCount() === 0) {
                    this.p2pManager.download(file);

                    if (this.p2pManager.getActiveDownloadsCount() === 0) {
                        this.httpManager.download(file);
                    }
                }*/
            }

            if (this.httpManager.getActiveDownloadsCount() === 1 && this.p2pManager.getActiveDownloadsCount() === 3) {
                return;
            }
        }


        if (this.httpManager.getActiveDownloadsCount() === 0 && this.p2pManager.getActiveDownloadsCount() === 0) {
            // load random file to buffer via http
            const downloadedFilesCount = this.fileQueue.reduce((sum, file) => {
                return sum + (this.cacheManager.has(file.url) ? 1 : 0);
            }, 0);

            if (downloadedFilesCount < this.bufferFilesCount) {
                const pendingQueue = this.fileQueue.filter(file =>
                    !this.cacheManager.has(file.url) &&
                    !this.httpManager.isDownloading(file) &&
                    !this.p2pManager.isDownloading(file));

                if (pendingQueue.length > 0) {
                    const random_index = Math.floor(Math.random() * pendingQueue.length);
                    this.httpManager.download(pendingQueue[random_index]);
                }
            }
        }

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
