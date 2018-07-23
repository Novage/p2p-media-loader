import {EventEmitter} from "events";
import {Events, LoaderInterface, HybridLoader} from "p2p-media-loader-core";
import {SegmentManager} from "./segment-manager";
import * as integration from "./integration";

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

        Object.keys(Events)
            .map(eventKey => Events[eventKey as any])
            .forEach(event => this.loader.on(event, (...args: any[]) => this.emit(event, ...args)));
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

    public initShakaPlayer(player: any) {
        integration.initShakaPlayer(player, this.segmentManager);
    }

}
