import SegmentCacheManagerInterface from "./segment-cache-manger-interface";
import Segment from "./segment";
import {EventEmitter} from "events";
import CacheEvents from "./cache-events";

export default class SegmentCacheManager extends EventEmitter implements SegmentCacheManagerInterface {

    private segments: Map<string, Segment> = new Map();

    public get(key: string): Segment | undefined {
        return this.segments.get(key);
    }

    public has(key: string): boolean {
        return this.segments.has(key);
    }

    public set(key: string, value: Segment): void {
        this.segments.set(key, value);
        this.emit(CacheEvents.CacheUpdated);
    }

    public keys(): Array<string> {
        return Array.from(this.segments.keys());
    }

    public delete(key: string): void {
        this.segments.delete(key);
        this.emit(CacheEvents.CacheUpdated);
    }

    public forEach(callbackfn: (value: Segment, key: string, map: Map<string, Segment>) => void, thisArg?: any): void {
        this.segments.forEach(callbackfn, thisArg);
    }

    public updateLastAccessed(key: string): void {
        const segment = this.get(key);
        if (segment) {
            segment.lastAccessed = new Date().getTime();
        }
    }

}
