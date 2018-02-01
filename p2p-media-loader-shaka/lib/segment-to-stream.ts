declare const shaka: any;

export class SegmentToStream {
    public getShakaManifestParser(): any {
        return null;
    }
}

export class ShakaManifestParserProxy {
    public constructor(readonly originalManifestParser: any) {
    }

    private hookGetSegmentReference(stream: any): void {
        const getSegmentReferenceOrignial = stream.getSegmentReference;
        stream.getSegmentReference = function(number: any) {
            const result = getSegmentReferenceOrignial(number);
            return result;
        };
    }

    public start(uri: string, playerInterface: any) {
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

            return manifest;
        });
    }

    public configure(config: any) {
        return this.originalManifestParser.configure(config);
    }

    public stop() {
        return this.originalManifestParser.stop();
    }

    public update() {
        return this.originalManifestParser.update();
    }

    public onExpirationUpdated() {
        return this.originalManifestParser.onExpirationUpdated();
    }
}

export class ShakaDashManifestParserProxy extends ShakaManifestParserProxy {
    public constructor() {
        super(new shaka.dash.DashParser());
    }
}

export class ShakaHlsManifestParserProxy extends ShakaManifestParserProxy {
    public constructor() {
        super(new shaka.hls.HlsParser());
    }
}
