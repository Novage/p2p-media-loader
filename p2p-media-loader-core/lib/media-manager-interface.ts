import SegmentInternal from "./segment-internal";

interface MediaManagerInterface {

    setSwarmId(id: string): void;
    on(eventName: string | symbol, listener: Function): this;
    download(segment: SegmentInternal): void;
    abort(segment: SegmentInternal): void;
    isDownloading(segment: SegmentInternal): boolean;
    getActiveDownloadsCount(): number;
    destroy(): void;

}

export default MediaManagerInterface;
