import LoaderFile from "./loader-file";

interface LoaderInterface {

    on(eventName: string | symbol, listener: Function): this;
    load(files: LoaderFile[], emitNowFileUrl: string, playlistUrl: string): void;

}

export default LoaderInterface;
