import * as Debug from "debug";
import {LoaderEvents, Segment as LoaderSegment, LoaderInterface} from "p2p-media-loader-core";
import {ParserSegment} from "./parser-segment";

const defaultSettings = {
    // Shaka player measures time spent on loading data when its request gets resolved;
    // Shaka player does assumtions about network speed and might decide to change playback quality (if its set to 'auto');
    // If simulateTimeDelation is true, we're trying to simulate this behaivior (meaning if some data was preloaded by us
    // and player asked for it, we do not resolve request immediatelly, we delay resolving for amount of time spent on loading that data);
    simulateTimeDelation: true
};

export default class {

    private debug = Debug("p2pml:shaka:sm");
    private loader: LoaderInterface;
    private requests: Map<string, Request> = new Map();
    private manifestUri: string = "";
    private parserSegments: ParserSegment[] = [];
    private settings: any = undefined;

    public constructor(loader: LoaderInterface, settings: any = {}) {
        this.settings = Object.assign(defaultSettings, settings);

        this.loader = loader;
        this.loader.on(LoaderEvents.SegmentLoaded, this.onSegmentLoaded);
        this.loader.on(LoaderEvents.SegmentError, this.onSegmentError);
        this.loader.on(LoaderEvents.SegmentAbort, this.onSegmentAbort);
    }

    public isSupported (): boolean {
        return this.loader.isSupported();
    }

    public async load (parserSegments: ParserSegment[], manifestUri: string): Promise<any> {
        this.parserSegments = parserSegments;
        this.manifestUri = manifestUri;
        const firstLoaderSegment = this.refreshLoad();

        const alreadyLoadedSegment = this.loader.getSegment(firstLoaderSegment.id);

        return new Promise<any>((resolve, reject) => {
            const request = new Request(firstLoaderSegment.id, resolve, reject);
            if (alreadyLoadedSegment) {
                this.reportSuccess(request, alreadyLoadedSegment);
            } else {
                this.debug("request add", request.id);
                this.requests.set(request.id, request);
            }
        });
    }

    public destroy () {
        this.loader.destroy();
    }

    private refreshLoad (): LoaderSegment {
        const manifestUri = this.manifestUri;
        const index = manifestUri.indexOf("?");
        const manifestUriNoQuery = (index === -1) ? manifestUri : manifestUri.substring(0, index);

        const loaderSegments: LoaderSegment[] = this.parserSegments.map((s, i) => {
            return new LoaderSegment(
                `${manifestUriNoQuery}+${s.identity}`,
                s.uri,
                s.range,
                i
            );
        });

        this.loader.load(loaderSegments, `${manifestUriNoQuery}+${this.parserSegments[ 0 ].streamIdentity}`);
        return loaderSegments[ 0 ];
    }

    private reportSuccess (request: Request, loaderSegment: LoaderSegment) {
        if (request.resolve) {
            let timeDelation = 0;
            if (this.settings.simulateTimeDelation && loaderSegment.downloadSpeed > 0 && loaderSegment.data && loaderSegment.data.byteLength > 0) {
                const downloadTime = Math.trunc(loaderSegment.data.byteLength / loaderSegment.downloadSpeed);
                timeDelation = Date.now() - request.timeCreated + downloadTime;
            }
            setTimeout(() => {
                this.debug("report success", request.id);
                request.resolve(loaderSegment.data);
            }, timeDelation);
        }
    }

    private reportError (request: Request, error: any) {
        if (request.reject) {
            this.debug("report error", request.id);
            request.reject(error);
        }
    }

    private onSegmentLoaded = (segment: LoaderSegment) => {
        if (this.requests.has(segment.id)) {
            this.reportSuccess(this.requests.get(segment.id)!, segment);
            this.debug("request delete", segment.id);
            this.requests.delete(segment.id);
        }
    }

    private onSegmentError = (segment: LoaderSegment, error: any) => {
        if (this.requests.has(segment.id)) {
            this.reportError(this.requests.get(segment.id)!, error);
            this.debug("request delete from error", segment.id);
            this.requests.delete(segment.id);
        }
    }

    private onSegmentAbort = (segment: LoaderSegment) => {
        if (this.requests.has(segment.id)) {
            this.reportError(this.requests.get(segment.id)!, "Internal abort");
            this.debug("request delete from abort", segment.id);
            this.requests.delete(segment.id);
        }
    }

} // end of default class

class Request {
    readonly timeCreated: number = Date.now();
    public constructor (
        readonly id: string,
        readonly resolve: any,
        readonly reject: any
    ) {}
}
