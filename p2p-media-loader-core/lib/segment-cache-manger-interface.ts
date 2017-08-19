import Segment from "./segment";

interface SegmentCacheManagerInterface  {

    get(key: string): Segment | undefined;
    has(key: string): boolean;
    set(key: string, value: Segment): void;
    keys(): Array<string>;
    delete(key: string): void;
    forEach(callbackfn: (value: Segment, key: string, map: Map<string, Segment>) => void, thisArg?: any): void;
    updateLastAccessed(key: string): void;
    on(eventName: string | symbol, listener: Function): this;

}

export default SegmentCacheManagerInterface;
