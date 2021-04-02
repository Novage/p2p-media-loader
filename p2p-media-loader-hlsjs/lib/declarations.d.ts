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

declare module "m3u8-parser" {
    export class Parser {
        constructor();
        push(m3u8: string): void;
        end(): void;
        manifest: Manifest;
    }

    export type Manifest = {
        mediaSequence?: number;
        segments: Segment[];
        playlists?: Playlist[];
    };

    export type Segment = {
        uri: string;
        byteRange?: { length: number; offset: number };
    };

    export type Playlist = {
        uri: string;
    };
}

// FIXME: fixes hls.js internal .js module import
declare module "*/loader/level" {
    export default class {}
}
