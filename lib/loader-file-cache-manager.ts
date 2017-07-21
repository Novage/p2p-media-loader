import LoaderFileCacheManagerInterface from "./loader-file-cache-manger-interface";
import LoaderFile from "./loader-file";

export default class LoaderFileCacheManager implements LoaderFileCacheManagerInterface {

    private files: Map<string, LoaderFile> = new Map();

    public get(key: string): LoaderFile | undefined {
        return this.files.get(key);
    }

    public has(key: string): boolean {
        return this.files.has(key);
    }

    public set(key: string, value: LoaderFile): void {
        this.files.set(key, value);
    }

    public delete(key: string): boolean {
        return this.files.delete(key);
    }

    public forEach(callbackfn: (value: LoaderFile, key: string, map: Map<string, LoaderFile>) => void, thisArg?: any): void {
        this.files.forEach(callbackfn, thisArg);
    }

    public updateLastAccessed(key: string): void {
        const file = this.get(key);
        if (file) {
            file.lastAccessed = new Date().getTime();
        }
    }

}
