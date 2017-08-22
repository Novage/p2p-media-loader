export default class SegmentInternal {

    public id: string;
    public url: string;
    public data: ArrayBuffer;
    public lastAccessed: number;
    public priority: number;

    public constructor(id: string, url: string, priority: number = 0) {
        this.id = id;
        this.url = url;
        this.priority = priority;
    }

}
