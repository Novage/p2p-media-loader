
import LoaderFile from "./loader-file";

interface LoaderFileCacheManagerInterface  {

    get(key: string): LoaderFile | undefined;
    has(key: string): boolean;
    set(key: string, value: LoaderFile): void;
    delete(key: string): boolean;
    forEach(callbackfn: (value: LoaderFile, key: string, map: Map<string, LoaderFile>) => void, thisArg?: any): void;
    updateLastAccessed(key: string): void;

}

export default LoaderFileCacheManagerInterface;
