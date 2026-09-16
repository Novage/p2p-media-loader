import type shaka from "shaka-player/dist/shaka-player.compiled.d.ts";
import { Shaka } from "./types.js";
import {
  Core,
  CoreRequestError,
  ProcessedManifest,
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

  /**
   * Shaka's own http(s) plugin for this browser: fetch where `fetch` and
   * `AbortController` both exist, XHR otherwise. Old Smart TV browsers have
   * fetch without AbortController; forcing the fetch plugin there throws
   * inside Shaka on the first request, before anything plays.
   */
  private readonly defaultPlugin: {
    parse: shaka.extern.SchemePlugin;
  };

  constructor(
    private readonly shaka: Shaka,
    private readonly core: Core,
    private readonly onManifestProcessed?: (
      manifest: ProcessedManifest,
    ) => void,
  ) {
    const { HttpFetchPlugin, HttpXHRPlugin } = shaka.net;
    this.defaultPlugin = HttpFetchPlugin.isSupported()
      ? HttpFetchPlugin
      : HttpXHRPlugin;
  }

  private defaultLoad() {
    return this.defaultPlugin.parse(...this.loadArgs);
  }

  load(...args: LoadingHandlerParams): LoadingHandlerResult {
    this.loadArgs = args;
    const { RequestType } = this.shaka.net.NetworkingEngine;
    const [url, request, requestType] = args;
    if (requestType === RequestType.SEGMENT) {
      return this.loadSegment(url, request);
    }

    const loading = this.defaultLoad();
    if (requestType === RequestType.MANIFEST) {
      // Every manifest Shaka fetches — master, media playlist, MPD refresh —
      // is handed to the core, which parses it before Shaka's own parser
      // runs on the same bytes. Shaka's parsing is untouched.
      loading.promise
        .then((response) => {
          const processed = this.core.processManifest({
            url: response.uri,
            data: response.data,
          });
          if (processed) this.onManifestProcessed?.(processed);
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

    // A SegmentBase stream's index is not media and never resolves against the
    // registry: Shaka loads it, and the core reads the segment list from the
    // same bytes. Recognition, not lookup — see specs/manifest-registry.md.
    if (this.core.isSegmentIndex(segmentUrl, byteRange)) {
      const loading = this.defaultLoad();
      loading.promise
        .then((response) => {
          this.core.processSegmentIndex({
            url: segmentUrl,
            byteRange,
            data: response.data,
          });
        })
        .catch(() => undefined);
      return loading;
    }

    // Whitelist by lookup: a segment the core's registry does not know, or
    // one whose stream has P2P disabled, loads through Shaka's own fetch.
    if (!this.core.isSegmentLoadable(segmentUrl, byteRange)) {
      return this.defaultLoad();
    }

    let aborted = false;
    const loadSegment = async (): Promise<Response> => {
      try {
        const { data, bandwidth } = await this.core.loadSegment(segmentUrl, {
          byteRange,
        });
        // The core cannot always cancel in time — a request waiting for the
        // segment storage has no loader yet — and Shaka expects the operation
        // it aborted to fail, not to deliver a segment it abandoned.
        if (aborted) throw new CoreRequestError("aborted");
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
        // Shaka's networking engine retries and reports only its own error
        // type, so a core failure is translated: an abort into the operation
        // Shaka itself cancelled, anything else into a recoverable network
        // error carrying the cause, which Shaka's retry parameters govern.
        const { Error: ShakaError } = this.shaka.util;
        const isAbort =
          error instanceof CoreRequestError && error.type === "aborted";
        throw new ShakaError(
          ShakaError.Severity.RECOVERABLE,
          ShakaError.Category.NETWORK,
          isAbort
            ? ShakaError.Code.OPERATION_ABORTED
            : ShakaError.Code.HTTP_ERROR,
          segmentUrl,
          error,
          this.shaka.net.NetworkingEngine.RequestType.SEGMENT,
        );
      }
    };

    return new this.shaka.util.AbortableOperation(loadSegment(), () => {
      aborted = true;
      this.core.abortSegmentLoading(segmentUrl, byteRange);
      return Promise.resolve();
    });
  }
}

/**
 * The download time Shaka's bandwidth estimator is told, in milliseconds,
 * derived from the core's bandwidth hint: a segment may have come from a peer
 * or from storage, so wall-clock time says nothing useful about the network.
 *
 * Never 0. Shaka weights each sample by its duration and computes
 * `bytes / durationMs`; a 0 ms sample is `Infinity` at weight 0, which the
 * EWMA turns into `NaN`, after which every variant comparison is false and
 * the player lurches between renditions — on a TV decoder, into a decode
 * error at the switch.
 */
function getLoadingDurationBasedOnBandwidth(
  bandwidth: number,
  bytesLoaded: number,
) {
  if (bandwidth <= 0) return 1;
  return Math.max(1, Math.round((bytesLoaded * 8 * 1000) / bandwidth));
}
