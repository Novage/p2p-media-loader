
import LoaderFile from "./loader-file";

interface LoaderFileCacheManagerInterface  {

    get(key: string): LoaderFile | undefined;
    has(key: string): boolean;
    set(key: string, value: LoaderFile): void;
    keys(): Array<string>;
    delete(key: string): void;
    forEach(callbackfn: (value: LoaderFile, key: string, map: Map<string, LoaderFile>) => void, thisArg?: any): void;
    updateLastAccessed(key: string): void;
    on(eventName: string | symbol, listener: Function): this;

}

export default LoaderFileCacheManagerInterface;
