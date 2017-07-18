import LoaderInterface from "./loader-interface";
import LoaderFile from "./loader-file";
import {EventEmitter} from "events";
import LoaderEvents from "./loader-events";

interface BaseLoader {

    on(eventName: string | symbol, listener: Function): this;
    start(file: LoaderFile): void;
    stop(file: LoaderFile): void;
    isLoading(file: LoaderFile): boolean;
    maxActiveDownloads(): number;

}

export default class HybridLoader extends EventEmitter implements LoaderInterface {

    private httpLoader: BaseLoader;
    private p2pLoader: BaseLoader;

    private readonly minFilesCount = 2;
    private fileQueue: LoaderFile[] = [];
    private downloadedFiles: LoaderFile[] = [];

    public constructor(httpLoader: BaseLoader, p2pLoader: BaseLoader) {
        super();

        this.httpLoader = httpLoader;
        this.p2pLoader = p2pLoader;

        httpLoader.on(LoaderEvents.FileLoaded, this.onFileLoaded.bind(this));
        p2pLoader.on(LoaderEvents.FileLoaded, this.onFileLoaded.bind(this));
    }

    load(files: LoaderFile[]): void {

        // stop all http requests and p2p downloads for files that are not in the new load
        this.fileQueue.forEach((file) => {
            if (files.findIndex((f) => f.url === file.url) === -1) {
                this.httpLoader.stop(file);
                this.p2pLoader.stop(file);
            }
        });

        // renew file queue
        this.fileQueue = [...files];

        // emit file loaded event if the file has already been downloaded
        this.fileQueue.forEach((file) => {
            const downloadedFile = this.downloadedFiles.find((f) => f.url === file.url);
            if (downloadedFile) {
                this.emit(LoaderEvents.FileLoaded, downloadedFile);
            }
        });

        // run main processing algorithm
        this.processFileQueue();
    }

    private processFileQueue(): void {
        for (let i = 0; i < this.fileQueue.length; i++) {
            const file = this.fileQueue[i];
            if (this.downloadedFiles.findIndex((f) => f.url === file.url) === -1) {
                if (i < this.minFilesCount) {
                    // force load required files via http
                    this.p2pLoader.stop(file);
                    this.httpLoader.start(file);
                } else if (!this.httpLoader.isLoading(file)) {
                    // try load files via p2p if http loading is not started
                    this.p2pLoader.start(file);
                }
            }
        }

        // load random file to buffer
        const pendingQueue = this.fileQueue.filter((file) => !this.httpLoader.isLoading(file) && !this.p2pLoader.isLoading(file));
        if (pendingQueue.length > 0 && this.httpLoader.maxActiveDownloads() < this.minFilesCount + 1) {
            const random_index = Math.floor(Math.random() * (pendingQueue.length + 1));
            this.httpLoader.start(pendingQueue[random_index]);
        }
    }

    private onFileLoaded(file: LoaderFile) {
        const downloadedFile = this.downloadedFiles.find((f) => f.url === file.url);
        if (!downloadedFile) {
            this.downloadedFiles.push(file);
        }
    }

}
