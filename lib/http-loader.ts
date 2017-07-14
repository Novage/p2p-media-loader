import LoaderInterface from "./loader-interface";
import LoaderFile from "./loader-file";
import {EventEmitter} from "events";

export default class HttpLoader extends EventEmitter implements LoaderInterface {

    private readonly simultaneousLoads = 2;
    private xhrRequests: Map<string, XMLHttpRequest> = new Map();
    private fileQueue: LoaderFile[] = [];
    private downloadedFiles: LoaderFile[] = [];

    public constructor() {
        super();
    }

    /**
     * Adds files to the download queue.
     * Cancels the download of previous ones if they are not in the new queue.
     * The result of the downloading will be emitted via file_loaded or file_error events.
     *
     * @param {LoaderFile[]} files Files to download.
     */
    public load(files: LoaderFile[]): void {

        // stop all xhr requests for files that are not in the new load
        this.fileQueue.forEach((file) => {
            if (files.findIndex((f) => f.url === file.url) === -1) {
                const xhr = this.xhrRequests.get(file.url);
                if (xhr) {
                    xhr.abort();
                    this.xhrRequests.delete(file.url);
                }
            }
        });

        // renew file queue
        this.fileQueue = [...files];

        // emit file loaded event if the file has already been downloaded
        this.fileQueue.forEach((file) => {
            const downloadedFile = this.downloadedFiles.find((f) => f.url === file.url);
            if (downloadedFile) {
                this.emit("file_loaded", downloadedFile);
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
            if (this.xhrRequests.size < this.simultaneousLoads &&
                !this.xhrRequests.has(file.url) && this.downloadedFiles.findIndex((f) => f.url === file.url) === -1) {

                this.xhrRequests.set(file.url, this.loadFile(file));
            }
        });
    }

    /**
     * Loads the specified file.
     *
     * @param {LoaderFile} file File to download.
     * @returns {XMLHttpRequest} An instance of XMLHttpRequest.
     */
    private loadFile(file: LoaderFile): XMLHttpRequest {
        const request = new XMLHttpRequest();
        request.open("GET", file.url, true);
        request.responseType = "arraybuffer";

        request.onload = (event: any) => {
            this.xhrRequests.delete(file.url);

            if (event.target.status === 200) {
                file.data = event.target.response;
                this.downloadedFiles.push(file);
                this.emit("file_loaded", file);
            } else {
                this.emit("file_error", event);
            }

            this.loadFileQueue();
        };

        request.onerror = (event: any) => {
            this.xhrRequests.delete(file.url);
            this.emit("file_error", event);
            this.loadFileQueue();
        };

        request.send();
        return request;
    }

}
