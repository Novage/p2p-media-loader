export default class SegmentInternal {
    public lastAccessed = 0;

    public constructor(
            readonly id: string,
            readonly url: string,
            readonly priority = 0,
            readonly data: ArrayBuffer | undefined = undefined) {
    }
}
