import LoaderInterface from "./loader-interface";
import {EventEmitter} from "events";
import LoaderFile from "./loader-file";

export default class HttpLoader extends EventEmitter implements LoaderInterface {

    private fileQueue: LoaderFile[];

    public constructor() {
        super();
    }

    public load(files: LoaderFile[]): void {
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
            if (event.target.status === 200) {
                file.data = event.target.response;
                this.emit("file_loaded", file);
            } else {
                console.warn("The file could not be loaded", event);
            }
        };

        request.send();
    }

}
