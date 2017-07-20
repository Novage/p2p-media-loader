
import LoaderFile from "./loader-file";

interface LoaderFileCacheManagerInterface  {

    get(key: string): LoaderFile | undefined;
    has(key: string): boolean;
    set(key: string, value: LoaderFile): void;
    updateLastAccessed(key: string): void;
    collectGarbage(): void;

}

export default LoaderFileCacheManagerInterface;
