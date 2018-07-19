import {EventEmitter} from "events";
import {LoaderInterface, HybridLoader} from "p2p-media-loader-core";
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
