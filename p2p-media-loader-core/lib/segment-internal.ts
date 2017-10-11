export default class SegmentInternal {

    public id: string;
    public url: string;
    public priority: number;
    public data: ArrayBuffer | undefined;
    public lastAccessed: number;

    public constructor(id: string, url: string, priority: number = 0, data: ArrayBuffer | undefined = undefined) {
        this.id = id;
        this.url = url;
        this.priority = priority;
        this.data = data;
        this.lastAccessed = 0;
    }

}
