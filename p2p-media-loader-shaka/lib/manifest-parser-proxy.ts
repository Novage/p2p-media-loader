/**
 * Copyright 2018 Novage LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ParserSegment, ParserSegmentCache } from "./parser-segment";

export class ShakaManifestParserProxy {

    private readonly cache: ParserSegmentCache = new ParserSegmentCache(200);
    private readonly originalManifestParser: any;
    private manifest: any;

    public constructor(originalManifestParser: any) {
        this.originalManifestParser = originalManifestParser;
    }

    public isHls() { return this.originalManifestParser instanceof shaka.hls.HlsParser; }
    public isDash() { return this.originalManifestParser instanceof shaka.dash.DashParser; }

    public start(uri: string, playerInterface: any) {
        // Tell P2P Media Loader's networking engine code about currently loading manifest
        if (playerInterface.networkingEngine.p2pml === undefined) {
            playerInterface.networkingEngine.p2pml = {};
        }
        playerInterface.networkingEngine.p2pml.masterManifestUri = uri;

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

    public find(uri: string, range?: string): ParserSegment | undefined {
        return this.cache.find(uri, range);
    }

    public reset() {
        this.cache.clear();
    }

    private hookGetSegmentReference(stream: any): void {
        stream.getSegmentReferenceOriginal = stream.getSegmentReference;

        stream.getSegmentReference = (segmentNumber: any) => {
            const reference = stream.getSegmentReferenceOriginal(segmentNumber)
            this.cache.add(stream, reference);
            return reference;
        };

        stream.getPosition = () => {
            if (this.isHls()) {
                if (stream.type === "video") {
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
    public constructor() {
        super(new shaka.dash.DashParser());
    }
}

export class ShakaHlsManifestParserProxy extends ShakaManifestParserProxy {
    public constructor() {
        super(new shaka.hls.HlsParser());
    }
}
