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

import { SegmentManager } from "./segment-manager";
import type { LoaderCallbacks, LoaderConfiguration, LoaderContext } from "hls.js/src/types/loader";

export class HlsJsLoader {
    private segmentManager: SegmentManager;

    public constructor(segmentManager: SegmentManager) {
        this.segmentManager = segmentManager;
    }

    public async load(
        context: LoaderContext,
        _config: LoaderConfiguration,
        callbacks: LoaderCallbacks<LoaderContext>
    ): Promise<void> {
        if (((context as unknown) as { type: unknown }).type) {
            try {
                const result = await this.segmentManager.loadPlaylist(context.url);
                this.successPlaylist(result, context, callbacks);
            } catch (e) {
                this.error(e, context, callbacks);
            }
        } else if (((context as unknown) as { frag: unknown }).frag) {
            try {
                const result = await this.segmentManager.loadSegment(
                    context.url,
                    context.rangeStart === undefined || context.rangeEnd === undefined || !(context.rangeEnd - context.rangeStart)
                        ? undefined
                        : { offset: context.rangeStart, length: context.rangeEnd - context.rangeStart }
                );
                const { content } = result;
                if (content !== undefined) {
                    setTimeout(() => this.successSegment(content, result.downloadBandwidth, context, callbacks), 0);
                }
            } catch (e) {
                setTimeout(() => this.error(e, context, callbacks), 0);
            }
        } else {
            console.warn("Unknown load request", context);
        }
    }

    public abort(context: LoaderContext): void {
        this.segmentManager.abortSegment(
            context.url,
            context.rangeStart === undefined || context.rangeEnd === undefined
                ? undefined
                : { offset: context.rangeStart, length: context.rangeEnd - context.rangeStart }
        );
    }

    private successPlaylist(
        xhr: { response: string; responseURL: string },
        context: LoaderContext,
        callbacks: LoaderCallbacks<LoaderContext>
    ): void {
        const stats = {
            aborted: false,
            retry: 0,
            chunkCount: 0,
            bwEstimate: 0,
            parsing: { start: 0, end: 0},
            loading: { start: 0, first: 0, end: 0 },
            buffering: { start: 0, first: 0, end: 0 },
            loaded: xhr.response.length,
            total: xhr.response.length,
        };

        callbacks.onSuccess(
            {
                url: xhr.responseURL,
                data: xhr.response,
            },
            stats,
            context,
            undefined
        );
    }

    private successSegment(
        content: ArrayBuffer,
        downloadBandwidth: number | undefined,
        context: LoaderContext,
        callbacks: LoaderCallbacks<LoaderContext>
    ): void {
        const stats = {
            aborted: false,
            retry: 0,
            chunkCount: 0,
            bwEstimate: 0,
            parsing: { start: 0, end: 0},
            loading: { start: 0, first: 0, end: 0 },
            buffering: { start: 0, first: 0, end: 0 },
            loaded: content.byteLength,
            total: content.byteLength,
        };

        if(callbacks.onProgress){
            callbacks.onProgress(stats, context, content, undefined)
        }

        callbacks.onSuccess(
            {
                url: context.url,
                data: content,
            },
            stats,
            context,
            undefined
        );
    }

    private error(
        error: any,
        context: LoaderContext,
        callbacks: LoaderCallbacks<LoaderContext>
    ): void {
        callbacks.onError(error, context, undefined);
    }
}
