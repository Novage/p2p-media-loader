import {ParserSegment, ParserSegmentCache} from "./parser-segment";

declare const shaka: any;

export class ShakaManifestParserProxy {

    readonly cache: ParserSegmentCache = new ParserSegmentCache(200);
    readonly originalManifestParser: any;

    public constructor (originalManifestParser: any) {
        this.originalManifestParser = originalManifestParser;
    }

    private hookGetSegmentReference (stream: any): void {
        stream.getSegmentReferenceOriginal = stream.getSegmentReference;
        stream.getSegmentReference = (number: any) => {
            this.cache.add(stream, number);
            return stream.getSegmentReferenceOriginal(number);
        };
    }

    public start (uri: string, playerInterface: any) {
        return this.originalManifestParser.start(uri, playerInterface).then((manifest: any) => {
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
        return sequence.length > 0 && sequence[ 0 ].type === 'video' ? sequence : [];
    }

    public reset () {
        this.cache.clear();
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
