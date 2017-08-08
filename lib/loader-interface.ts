import LoaderFile from "./loader-file";

interface LoaderInterface {

    on(eventName: string | symbol, listener: Function): this;
    load(files: LoaderFile[], swarmId: string, emitNowFileUrl?: string): void;

}

export default LoaderInterface;
