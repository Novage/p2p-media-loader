import {ParserSegment, ParserSegmentCache} from "./parser-segment";

declare const shaka: any;

export class ShakaManifestParserProxy {

    readonly cache: ParserSegmentCache = new ParserSegmentCache(200);
    readonly originalManifestParser: any;
    private manifest: any;

    public constructor (originalManifestParser: any) {
        this.originalManifestParser = originalManifestParser;
    }

    public isHls () { return this.originalManifestParser instanceof shaka.hls.HlsParser; }
    public isDash () { return this.originalManifestParser instanceof shaka.dash.DashParser; }

    public start (uri: string, playerInterface: any) {
        return this.originalManifestParser.start(uri, playerInterface).then((manifest: any) => {
            this.manifest = manifest;

            for (const period of manifest.periods) {
                const processedStreams = [];

                for (const variant of period.variants) {
                    if ((variant.video != null) && (processedStreams.indexOf(variant.video) == -1)) {
                        this.hookGetSegmentReference(variant.video);
                        processedStreams.push(variant.video);
                    }

                    if ((variant.audio != null) && (processedStreams.indexOf(variant.audio) == -1)) {
                        this.hookGetSegmentReference(variant.audio);
                        processedStreams.push(variant.audio);
                    }
                }
            }

            manifest.p2pml = {parser: this};
            return manifest;
        });
    }

    public configure (config: any) {
        return this.originalManifestParser.configure(config);
    }

    public stop () {
        return this.originalManifestParser.stop();
    }

    public update () {
        return this.originalManifestParser.update();
    }

    public onExpirationUpdated () {
        return this.originalManifestParser.onExpirationUpdated();
    }

    public getForwardSequence (uri: string, range: string, duration: number) : ParserSegment[] {
        const sequence = this.cache.getForwardSequence(uri, range, duration);
        return sequence.length > 0 && sequence[ 0 ].streamType === 'video' ? sequence : [];
    }

    public reset () {
        this.cache.clear();
    }

    private hookGetSegmentReference (stream: any): void {
        stream.getSegmentReferenceOriginal = stream.getSegmentReference;

        stream.getSegmentReference = (number: any) => {
            this.cache.add(stream, number);
            return stream.getSegmentReferenceOriginal(number);
        };

        stream.getPosition = () => {
            if (this.isHls()) {
                if (stream.type === 'video') {
                    return this.manifest.periods[0].variants.reduce((a: any, i: any) => {
                        if (i.video && i.video.id && !a.includes(i.video.id)) {
                            a.push(i.video.id);
                        }
                        return a;
                    }, []).indexOf(stream.id);
                }
            }
            return -1;
        };
    }

} // end of ShakaManifestParserProxy

export class ShakaDashManifestParserProxy extends ShakaManifestParserProxy {
    public constructor () {
        super(new shaka.dash.DashParser());
    }
}

export class ShakaHlsManifestParserProxy extends ShakaManifestParserProxy {
    public constructor () {
        super(new shaka.hls.HlsParser());
    }
}
