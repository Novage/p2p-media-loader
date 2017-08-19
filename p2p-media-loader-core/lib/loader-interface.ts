import Segment from "./segment";

interface LoaderInterface {

    on(eventName: string | symbol, listener: Function): this;
    load(segments: Segment[], swarmId: string, emitNowSegmentUrl?: string): void;
    destroy(): void;

}

export default LoaderInterface;
