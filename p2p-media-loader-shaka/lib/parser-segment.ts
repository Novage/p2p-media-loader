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

import { getSchemedUri } from "./utils";
import { HookedShakaStream } from "./manifest-parser-proxy";

export class ParserSegment {
    public static create(
        stream: HookedShakaStream,
        segmentReference: shaka.media.SegmentReference | null
    ): ParserSegment | undefined {
        if (!segmentReference) {
            return undefined;
        }

        const uris = segmentReference.createUris();
        if (!uris || uris.length === 0) {
            return undefined;
        }

        const start = segmentReference.getStartTime();
        const end = segmentReference.getEndTime();

        const startByte = segmentReference.getStartByte();
        const endByte = segmentReference.getEndByte();
        const range = startByte || endByte ? `bytes=${startByte || ""}-${endByte || ""}` : undefined;

        const streamTypeCode = stream.type.substring(0, 1).toUpperCase();
        const streamPosition = stream.getPosition();
        const streamIsHls = streamPosition >= 0;

        const streamIdentity = streamIsHls ? `${streamTypeCode}${streamPosition}` : `${streamTypeCode}${stream.id}`;

        const identity = streamIsHls ? `${segmentReference.getPosition()}` : `${Number(start).toFixed(3)}`;

        return new ParserSegment(
            stream.id,
            stream.type,
            streamPosition,
            streamIdentity,
            identity,
            segmentReference.getPosition(),
            start,
            end,
            getSchemedUri(uris[0]),
            range,
            () => ParserSegment.create(stream, stream.getSegmentReferenceOriginal(segmentReference.getPosition() - 1))
        );
    }

    private constructor(
        readonly streamId: number,
        readonly streamType: string,
        readonly streamPosition: number,
        readonly streamIdentity: string,
        readonly identity: string,
        readonly position: number,
        readonly start: number,
        readonly end: number,
        readonly uri: string,
        readonly range: string | undefined,
        readonly next: () => ParserSegment | undefined
    ) {}
} // end of ParserSegment

export class ParserSegmentCache {
    private readonly segments: ParserSegment[] = [];
    private readonly maxSegments: number;

    public constructor(maxSegments: number) {
        this.maxSegments = maxSegments;
    }

    public find(uri: string, range?: string): ParserSegment | undefined {
        return this.segments.find((i) => i.uri === uri && i.range === range);
    }

    public add(stream: HookedShakaStream, segmentReference: shaka.media.SegmentReference | null): void {
        const segment = ParserSegment.create(stream, segmentReference);
        if (segment && !this.find(segment.uri, segment.range)) {
            this.segments.push(segment);
            if (this.segments.length > this.maxSegments) {
                this.segments.splice(0, this.maxSegments * 0.2);
            }
        }
    }

    public clear(): void {
        this.segments.splice(0);
    }
} // end of ParserSegmentCache
