import {EventEmitter} from "events";
import {LoaderEvents, LoaderInterface, HybridLoader} from "p2p-media-loader-core";
import {SegmentManager} from "./segment-manager";
import {HlsJsLoader} from "./hlsjs-loader";
import {createHlsJsLoaderClass} from "./hlsjs-loader-class";

export class Engine extends EventEmitter {

    public static isSupported(): boolean {
        return HybridLoader.isSupported();
    }

    private readonly loader: LoaderInterface;
    private readonly segmentManager: SegmentManager;

    public constructor(settings: any = {}) {
        super();

        this.loader = new HybridLoader(settings.loader);
        this.segmentManager = new SegmentManager(this.loader, settings.segments);

        Object.keys(LoaderEvents)
            .map(eventKey => LoaderEvents[eventKey as any])
            .forEach(event => this.loader.on(event, (...args: any[]) => this.emit(event, ...args)));
    }

    public createLoaderClass(): any {
        return createHlsJsLoaderClass(HlsJsLoader, this);
    }

    public destroy() {
        this.loader.destroy();
        this.segmentManager.destroy();
    }

    public getSettings(): any {
        return {
            segments: this.segmentManager.getSettings(),
            loader: this.loader.getSettings()
        };
    }

    public setPlayingSegment(url: string) {
        this.segmentManager.setPlayingSegment(url);
    }

}
