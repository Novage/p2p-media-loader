import LoaderInterface from "./loader-interface";
import {EventEmitter} from "events";
import {LoaderFile} from "./loader-file";

export default class HttpLoader extends EventEmitter implements LoaderInterface {

    fileQueue: LoaderFile[];

    constructor() {
        super();
    }

    load(files: LoaderFile[]): void {
        this.fileQueue = [...files];
        this.fileQueue.forEach((file) => {
            this.loadFile(file);
        });
    }

    private loadFile(file: LoaderFile) {
        const request = new XMLHttpRequest();
        request.open("GET", file.url, true);
        request.responseType = "arraybuffer";

        request.onload = (event: any) => {
            file.data = event.target.response;
            this.emit("file_loaded", file);
        };

        request.send();
    }

}
