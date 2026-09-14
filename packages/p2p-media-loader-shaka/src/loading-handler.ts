import type shaka from "shaka-player/dist/shaka-player.compiled.d.ts";
import { Shaka } from "./types.js";
import {
  Core,
  CoreRequestError,
  byteRangeFromRangeHeader,
} from "p2p-media-loader-core";

type LoadingHandlerParams = Parameters<shaka.extern.SchemePlugin>;
type Response = shaka.extern.Response;
type LoadingHandlerResult = shaka.extern.IAbortableOperation<Response>;

/**
 * Shaka routes every request type through one scheme plugin, so this is
 * where the adapter's whitelist lives: manifests are observed, segments are
 * served through the core, and everything else — licences, keys,
 * certificates, timing, steering — passes through untouched. See
 * specs/encryption.md.
 */
export class Loader {
  private loadArgs!: LoadingHandlerParams;

  constructor(
    private readonly shaka: Shaka,
    private readonly core: Core,
  ) {}

  private defaultLoad() {
    const fetchPlugin = this.shaka.net.HttpFetchPlugin;
    return fetchPlugin.parse(...this.loadArgs);
  }

  load(...args: LoadingHandlerParams): LoadingHandlerResult {
    this.loadArgs = args;
    const { RequestType } = this.shaka.net.NetworkingEngine;
    const [url, request, requestType] = args;
    if (requestType === RequestType.SEGMENT) {
      return this.loadSegment(url, request);
    }

    const loading = this.defaultLoad() as LoadingHandlerResult;
    if (requestType === RequestType.MANIFEST) {
      // Every manifest Shaka fetches — master, media playlist, MPD refresh —
      // is handed to the core, which parses it before Shaka's own parser
      // runs on the same bytes. Shaka's parsing is untouched.
      loading.promise
        .then((response) => {
          this.core.processManifest({
            url: response.uri,
            data: response.data,
          });
        })
        .catch(() => undefined);
    }
    return loading;
  }

  private loadSegment(
    segmentUrl: string,
    originalRequest: shaka.extern.Request,
  ): LoadingHandlerResult {
    const byteRange = byteRangeFromRangeHeader(originalRequest.headers.Range);

    // Whitelist by lookup: a segment the core's registry does not know, or
    // one whose stream has P2P disabled, loads through Shaka's own fetch.
    if (!this.core.isSegmentLoadable(segmentUrl, byteRange)) {
      return this.defaultLoad() as LoadingHandlerResult;
    }

    const loadSegment = async (): Promise<Response> => {
      try {
        const { data, bandwidth } = await this.core.loadSegment(segmentUrl, {
          byteRange,
        });
        return {
          data,
          headers: {},
          originalRequest,
          uri: segmentUrl,
          originalUri: segmentUrl,
          timeMs: getLoadingDurationBasedOnBandwidth(
            bandwidth,
            data.byteLength,
          ),
        };
      } catch (error) {
        // TODO: throw Shaka Errors
        if (error instanceof CoreRequestError) {
          const { Error: ShakaError } = this.shaka.util;
          if (error.type === "aborted") {
            throw new ShakaError(
              ShakaError.Severity.RECOVERABLE,
              ShakaError.Category.NETWORK,
              this.shaka.util.Error.Code.OPERATION_ABORTED,
            );
          }
        }
        throw error;
      }
    };

    return new this.shaka.util.AbortableOperation(loadSegment(), () => {
      this.core.abortSegmentLoading(segmentUrl, byteRange);
      return Promise.resolve();
    });
  }
}

function getLoadingDurationBasedOnBandwidth(
  bandwidth: number,
  bytesLoaded: number,
) {
  const bits = bytesLoaded * 8;
  return bandwidth > 0 ? Math.round(bits / bandwidth) * 1000 : 0;
}
