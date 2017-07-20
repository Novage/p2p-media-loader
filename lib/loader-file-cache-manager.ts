import LoaderFileCacheManagerInterface from "./loader-file-cache-manger-interface";
import LoaderFile from "./loader-file";

export default class LoaderFileCacheManager implements LoaderFileCacheManagerInterface {

    private readonly loaderFileExpiration = 1 * 60 * 1000; // milliseconds
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

    public updateLastAccessed(key: string): void {
        const file = this.get(key);
        if (file) {
            file.lastAccessed = new Date().getTime();
        }
    }

    public collectGarbage(): void {
        const now = new Date().getTime();
        //this.downloadedFiles = this.downloadedFiles.filter((f) => now - f.lastAccessed < this.loaderFileExpiration);
    }

}
