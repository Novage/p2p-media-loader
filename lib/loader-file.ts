export default class LoaderFile {

    public url: string;
    public data: ArrayBuffer;
    public lastAccessed: number;
    public priority: number = 0;

    public constructor(url: string) {
        this.url = url;
    }

}
