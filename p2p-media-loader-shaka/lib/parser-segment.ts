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

import {getSchemedUri} from "./utils";

export class ParserSegment {

    public static create(stream: any, position: number): ParserSegment | undefined {
        const ref = stream.getSegmentReferenceOriginal(position);
        if (!ref) {
            return undefined;
        }

        const uris = ref.createUris();
        if (!uris || uris.length === 0) {
            return undefined;
        }

        const start = ref.getStartTime();
        const end = ref.getEndTime();

        const startByte = ref.getStartByte();
        const endByte = ref.getEndByte();
        const range = startByte || endByte
            ? `bytes=${startByte || ""}-${endByte || ""}`
            : undefined;

        const streamTypeCode = stream.type.substring(0, 1).toUpperCase();
        const streamPosition = stream.getPosition();
        const streamIsHls = streamPosition >= 0;

        const streamIdentity = streamIsHls
            ? `${streamTypeCode}${streamPosition}`
            : `${streamTypeCode}${stream.id}`;

        const identity = streamIsHls
            ? `${streamIdentity}+${position}`
            : `${streamIdentity}+${Number(start).toFixed(3)}`;

        return new ParserSegment(
            stream.id,
            stream.type,
            streamPosition,
            streamIdentity,
            identity,
            position,
            start,
            end,
            getSchemedUri(uris[ 0 ]),
            range,
            () => ParserSegment.create(stream, position - 1),
            () => ParserSegment.create(stream, position + 1)
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
        readonly prev: () => ParserSegment | undefined,
        readonly next: () => ParserSegment | undefined
    ) {}

} // end of ParserSegment

export class ParserSegmentCache {

    readonly segments: ParserSegment[] = [];
    readonly maxSegments: number;

    public constructor(maxSegments: number) {
        this.maxSegments = maxSegments;
    }

    public find(uri: string, range?: string) {
        return this.segments.find(i => i.uri === uri && i.range === range);
    }

    public add(stream: any, position: number) {
        const segment = ParserSegment.create(stream, position);
        if (segment && !this.find(segment.uri, segment.range)) {
            this.segments.push(segment);
            if (this.segments.length > this.maxSegments) {
                this.segments.splice(0, this.maxSegments * 0.2);
            }
        }
    }

    public clear() {
        this.segments.splice(0);
    }

} // end of ParserSegmentCache
