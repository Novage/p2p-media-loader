import SegmentInternal from "./segment-internal";

interface SegmentCacheManagerInterface  {

    get(key: string): SegmentInternal | undefined;
    has(key: string): boolean;
    set(key: string, value: SegmentInternal): void;
    keys(): Array<string>;
    delete(keys: string[]): void;
    destroy(): void;
    forEach(callbackfn: (value: SegmentInternal, key: string, map: Map<string, SegmentInternal>) => void, thisArg?: any): void;
    updateLastAccessed(key: string): void;
    on(eventName: string | symbol, listener: Function): this;

}

export default SegmentCacheManagerInterface;
