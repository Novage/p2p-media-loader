import LoaderInterface from "./loader-interface";
import LoaderFile from "./loader-file";
import LoaderEvents from "./loader-events";
import MediaManagerInterface from "./media-manager-interface";
import LoaderFileCacheManagerInterface from "./loader-file-cache-manger-interface";
import {EventEmitter} from "events";
import HttpMediaManager from "./http-media-manager";
import P2PMediaManager from "./p2p-media-manager";
import LoaderFileCacheManager from "./loader-file-cache-manager";
import MediaPeerEvents from "./media-peer-events";
import MediaPeer from "./media-peer";

export default class HybridLoader extends EventEmitter implements LoaderInterface {

    private httpManager: MediaManagerInterface;
    private p2pManager: MediaManagerInterface;
    private cacheManager: LoaderFileCacheManagerInterface;

    private readonly loaderFileExpiration = 3 * 60 * 1000; // milliseconds
    private readonly requiredFilesCount = 2;
    private readonly bufferFilesCount = 3;
    private fileQueue: LoaderFile[] = [];

    public constructor() {
        super();

        this.cacheManager = new LoaderFileCacheManager();

        this.httpManager = new HttpMediaManager();
        this.httpManager.on(LoaderEvents.FileLoaded, this.onHttpFileLoaded.bind(this));
        this.httpManager.on(LoaderEvents.FileError, this.onFileError.bind(this));

        this.p2pManager = new P2PMediaManager(this.cacheManager);
        this.p2pManager.on(LoaderEvents.FileLoaded, this.onP2PFileLoaded.bind(this));
        this.p2pManager.on(LoaderEvents.FileError, this.onFileError.bind(this));
        this.p2pManager.on(LoaderEvents.ForceProcessing, this.processFileQueue.bind(this));
        this.p2pManager.on(MediaPeerEvents.Connect, this.onPeerConnect.bind(this));
        this.p2pManager.on(MediaPeerEvents.Close, this.onPeerClose.bind(this));

        setInterval(() => {
            this.processFileQueue();
        }, 1000);
    }

    load(files: LoaderFile[], swarmId: string, emitNowFileUrl?: string): void {
        //console.log("load()", files.length, files);
        //console.log("emitNowFileUrl", emitNowFileUrl);
        //console.log("--------------------------------------------------------------------------");
        this.p2pManager.setSwarmId(swarmId);

        // stop all http requests and p2p downloads for files that are not in the new load
        this.fileQueue.forEach(file => {
            if (files.findIndex(f => f.url === file.url) === -1) {
                this.httpManager.abort(file);
                this.p2pManager.abort(file);
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
        //this.collectGarbage();
    }

    private processFileQueue(): void {
        const startingPriority = this.fileQueue.length > 0 ? this.fileQueue[0].priority : 0;

        for (let index = 0; index < this.fileQueue.length; index++) {
            const file = this.fileQueue[index];
            if (!this.cacheManager.has(file.url)) {
                if (index < this.requiredFilesCount && this.requiredFilesCount > startingPriority) {
                    // first file is urgent so stop all other http requests?
                    if (index === 0 && !this.httpManager.isDownloading(file) && this.httpManager.getActiveDownloadsCount() > 0) {
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

    private onHttpFileLoaded(file: LoaderFile): void {
        if (!this.cacheManager.has(file.url)) {
            this.emit("statistics_file_loaded", {"method": "http", "size": file.data.byteLength});
        }
        this.onFileLoaded(file);
    }

    private onP2PFileLoaded(file: LoaderFile): void {
        if (!this.cacheManager.has(file.url)) {
            this.emit("statistics_file_loaded", {"method": "p2p", "size": file.data.byteLength});
        }
        this.onFileLoaded(file);
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

    private onPeerConnect(mediaPeer: MediaPeer): void {
        this.emit("peer_connect", mediaPeer);
    }

    private onPeerClose(mediaPeer: MediaPeer): void {
        this.emit("peer_close", mediaPeer);
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
