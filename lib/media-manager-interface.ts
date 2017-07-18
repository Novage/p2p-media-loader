import LoaderFile from "./loader-file";

interface MediaManagerInterface {

    on(eventName: string | symbol, listener: Function): this;
    download(file: LoaderFile): void;
    abort(file: LoaderFile): void;
    isDownloading(file: LoaderFile): boolean;
    getActiveDownloadsCount(): number;

}

export default MediaManagerInterface;
