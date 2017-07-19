export default class LoaderFile {

    public url: string;
    public data: ArrayBuffer;
    public lastAccessed: number;

    public constructor(url: string) {
        this.url = url;
    }

}
