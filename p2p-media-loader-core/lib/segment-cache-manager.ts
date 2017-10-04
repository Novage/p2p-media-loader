import SegmentInternal from "./segment-internal";

export default class SegmentCacheManager {

    private segments: Map<string, SegmentInternal> = new Map();

    public get(key: string): SegmentInternal | undefined {
        return this.segments.get(key);
    }

    public has(key: string): boolean {
        return this.segments.has(key);
    }

    public set(key: string, value: SegmentInternal): void {
        this.segments.set(key, value);
    }

    public keys(): Array<string> {
        return Array.from(this.segments.keys());
    }

    public delete(keys: string[]): void {
        keys.forEach(key => this.segments.delete(key));
    }

    public destroy(): void {
        this.segments.clear();
    }

    public forEach(callbackfn: (value: SegmentInternal, key: string, map: Map<string, SegmentInternal>) => void, thisArg?: any): void {
        this.segments.forEach(callbackfn, thisArg);
    }

    public updateLastAccessed(key: string): void {
        const segment = this.get(key);
        if (segment) {
            segment.lastAccessed = new Date().getTime();
        }
    }

}
