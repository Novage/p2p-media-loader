import Segment from "./segment";

interface MediaManagerInterface {

    setSwarmId(id: string): void;
    on(eventName: string | symbol, listener: Function): this;
    download(segment: Segment): void;
    abort(segment: Segment): void;
    isDownloading(segment: Segment): boolean;
    getActiveDownloadsCount(): number;

}

export default MediaManagerInterface;
