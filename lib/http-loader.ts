import LoaderInterface from "./loader-interface";
import LoaderFile from "./loader-file";
import LoaderEvents from "./loader-events";
import MediaManagerInterface from "./media-manager-interface";
import {EventEmitter} from "events";

export default class HttpLoader extends EventEmitter implements LoaderInterface {

    private readonly simultaneousLoads = 2;
    private fileQueue: LoaderFile[] = [];
    private downloadedFiles: LoaderFile[] = [];
    private httpManager: MediaManagerInterface;

    public constructor(httpManager: MediaManagerInterface) {
        super();

        this.httpManager = httpManager;
        this.httpManager.on(LoaderEvents.FileLoaded, this.onFileLoaded.bind(this));
        this.httpManager.on(LoaderEvents.FileError, this.onFileError.bind(this));
    }

    /**
     * Adds files to the download queue.
     * Cancels the download of previous ones if they are not in the new queue.
     * The result of the downloading will be emitted via file_loaded or file_error of {LoaderEvents}.
     *
     * @param {LoaderFile[]} files Files to download.
     */
    public load(files: LoaderFile[]): void {

        // stop all xhr requests for files that are not in the new load
        this.fileQueue.forEach((file) => {
            if (files.findIndex((f) => f.url === file.url) === -1) {
                this.httpManager.abort(file);
            }
        });

        // renew file queue
        this.fileQueue = [...files];

        // emit file loaded event if the file has already been downloaded
        this.fileQueue.forEach((file) => {
            const downloadedFile = this.downloadedFiles.find((f) => f.url === file.url);
            if (downloadedFile) {
                this.emitFileLoaded(downloadedFile);
            }
        });

        this.loadFileQueue();
    }

    /**
     * Loops through the files queue and starts file loading. Also saves an instance of XMLHttpRequest of the uploaded file.
     *
     * Starts downloading if:
     * - number of simultaneous downloads not exceeded;
     * - downloading of this file has not started yet;
     * - the file is not in the list of downloaded files.
     */
    private loadFileQueue(): void {
        this.fileQueue.forEach((file) => {
            if (this.httpManager.getActiveDownloadsCount() < this.simultaneousLoads &&
                !this.httpManager.isDownloading(file) && this.downloadedFiles.findIndex((f) => f.url === file.url) === -1) {

                this.httpManager.download(file);
            }
        });
    }

    private onFileLoaded(file: LoaderFile) {
        const downloadedFile = this.downloadedFiles.find(f => f.url === file.url);
        if (!downloadedFile) {
            this.downloadedFiles.push(file);
            this.emitFileLoaded(file);
        }
        this.loadFileQueue();
    }

    private onFileError(url: string, event: any) {
        this.emit(LoaderEvents.FileLoaded, url, event);
        this.loadFileQueue();
    }

    /**
     * Emits {LoaderEvents.FileLoaded} event with copy of loaded file.
     *
     * @param {LoaderFile} file Input file
     */
    private emitFileLoaded(file: LoaderFile) {
        const fileCopy = new LoaderFile(file.url);
        fileCopy.data = file.data.slice(0);

        this.emit(LoaderEvents.FileLoaded, fileCopy);
    }



}
