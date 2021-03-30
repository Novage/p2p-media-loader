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

export type HookedShakaStream = shaka.extern.Stream & {
    getSegmentReferenceOriginal: shaka.extern.GetSegmentReferenceFunction;
    createSegmentIndexOriginal: shaka.extern.CreateSegmentIndexFunction;
    getPosition: () => number
};
export type HookedShakaManifest = shaka.extern.Manifest & { p2pml?: { parser: ShakaManifestParserProxy } };
export type HookedShakaNetworkingEngine = shaka.net.NetworkingEngine & { p2pml?: { masterManifestUri: string } };

export class ShakaManifestParserProxy implements shaka.extern.ManifestParser {

    private readonly cache: ParserSegmentCache = new ParserSegmentCache(200);
    private readonly originalManifestParser: shaka.extern.ManifestParser;
    private manifest?: HookedShakaManifest;

    public constructor(originalManifestParser: shaka.extern.ManifestParser) {
        this.originalManifestParser = originalManifestParser;
    }

    isHls(): boolean {
        return this.originalManifestParser instanceof shaka.hls.HlsParser;
    }

    isDash(): boolean {
        return this.originalManifestParser instanceof shaka.dash.DashParser;
    }

    public async start(uri: string, playerInterface: shaka.extern.ManifestParser.PlayerInterface): Promise<shaka.extern.Manifest> {
        // Tell P2P Media Loader's networking engine code about currently loading manifest
        const networkingEngine = playerInterface.networkingEngine as shaka.net.NetworkingEngine & { p2pml?: { masterManifestUri: string } };
        networkingEngine.p2pml = { masterManifestUri: uri };

        this.manifest = await this.originalManifestParser.start(uri, playerInterface);

        for (const period of this.manifest.periods) {
            const processedStreams = [];

            for (const variant of period.variants) {
                if ((variant.video !== null) && (processedStreams.indexOf(variant.video) === -1)) {
                    if (variant.video.getSegmentReference as shaka.extern.GetSegmentReferenceFunction | undefined) {
                        this.hookGetSegmentReference(variant.video as HookedShakaStream);
                    } else {
                        this.hookSegmentIndex(variant.video as HookedShakaStream);
                    }
                    processedStreams.push(variant.video);
                }

                if ((variant.audio !== null) && (processedStreams.indexOf(variant.audio) === -1)) {
                    if (variant.audio.getSegmentReference as shaka.extern.GetSegmentReferenceFunction | undefined) {
                        this.hookGetSegmentReference(variant.audio as HookedShakaStream);
                    } else {
                        this.hookSegmentIndex(variant.audio as HookedShakaStream);
                    }
                    processedStreams.push(variant.audio);
                }
            }
        }

        this.manifest.p2pml = { parser: this };
        return this.manifest;
    }

    public configure(config: shaka.extern.ManifestConfiguration): void {
        return this.originalManifestParser.configure(config);
    }

    public stop(): Promise<unknown> {
        return this.originalManifestParser.stop();
    }

    public update(): void {
        return this.originalManifestParser.update();
    }

    public onExpirationUpdated(sessionId: string, expiration: number): void {
        return this.originalManifestParser.onExpirationUpdated(sessionId, expiration);
    }

    public find(uri: string, range?: string): ParserSegment | undefined {
        return this.cache.find(uri, range);
    }

    public reset(): void {
        this.cache.clear();
    }

    private hookGetSegmentReference(stream: HookedShakaStream): void {
        // Works for Shaka Player version <= 2.5

        stream.getSegmentReferenceOriginal = stream.getSegmentReference;

        stream.getSegmentReference = (segmentNumber: number) => {
            const reference = stream.getSegmentReferenceOriginal(segmentNumber);
            this.cache.add(stream, reference);
            return reference;
        };

        stream.getPosition = () => this.getPosition(stream);
    }

    private hookSegmentIndex(stream: HookedShakaStream): void {
        // Works for Shaka Player version >= 2.6

        stream.createSegmentIndexOriginal = stream.createSegmentIndex;
        stream.createSegmentIndex = async () => {
            const result = await stream.createSegmentIndexOriginal();

            // eslint-disable-next-line @typescript-eslint/unbound-method
            const getOriginal = stream.segmentIndex.get;
            stream.getSegmentReferenceOriginal = (segmentNumber: number) => getOriginal.call(stream.segmentIndex, segmentNumber);

            stream.segmentIndex.get = (segmentNumber: number) => {
                const reference = stream.getSegmentReferenceOriginal(segmentNumber);
                this.cache.add(stream, reference);
                return reference;
            };

            return result;
        };

        stream.getPosition = () => this.getPosition(stream);
    }

    private getPosition = (stream: shaka.extern.Stream): number => {
        if (this.isHls()) {
            if (stream.type === "video") {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                return this.manifest!.periods[0].variants.reduce((streams: number[], stream: shaka.extern.Variant) => {
                    if (stream.video && stream.video.id && !streams.includes(stream.video.id)) {
                        streams.push(stream.video.id);
                    }
                    return streams;
                }, []).indexOf(stream.id);
            }
        }
        return -1;
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
