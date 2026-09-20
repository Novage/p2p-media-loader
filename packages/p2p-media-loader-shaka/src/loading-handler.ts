import type shaka from "shaka-player/dist/shaka-player.compiled.d.ts";
import { Shaka } from "./types.js";
import { defaultPluginFor } from "./default-plugin.js";
import {
  Core,
  CoreRequestError,
  ProcessedManifest,
  byteRangeFromRangeHeader,
  downloadTimeMs,
} from "p2p-media-loader-core";
import { stripPatchLocation } from "p2p-media-loader-core/dash";

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
  /** The presentation this request was made for; see `currentSource`. */
  private readonly source: object | undefined;

  constructor(
    private readonly shaka: Shaka,
    private readonly core: Core,
    private readonly currentSource: () => object | undefined,
    private readonly onManifestProcessed?: (
      manifest: ProcessedManifest,
    ) => void,
  ) {
    this.source = currentSource();
  }

  /**
   * Whether what this request is about to hand the core is still the core's
   * to take: the presentation it was made for is the one playing now. A
   * request made when there was none at all — the engine let the player go
   * between the filter stamping this request and Shaka sending it — is of no
   * presentation, and neither is one whose own has since been left.
   */
  private ofThisPresentation(): boolean {
    return this.source !== undefined && this.currentSource() === this.source;
  }

  /** Whatever Shaka would have loaded this request with. */
  private defaultLoad() {
    const [uri] = this.loadArgs;
    return defaultPluginFor(this.shaka, uri).parse(...this.loadArgs);
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
          if (!this.ofThisPresentation()) return;
          // Take `PatchLocation` out before Shaka parses the same response: a
          // player following it refreshes by patch, which the core cannot
          // read, and its registry would freeze at this window. This handler
          // is attached before Shaka's own, so what it parses is what is left
          // here. See specs/player-adapters.md.
          const manifest = withoutPatchLocation(response.data);
          response.data = manifest.data;
          const processed = this.core.processManifest({
            // Shaka's `uri` follows redirects and `originalUri` is what was
            // asked for: the name the master gave this playlist.
            url: response.uri,
            requestedUrl: response.originalUri,
            // The text where the bytes decoded — decoded once, here, for
            // both the core and the strip above — and the bytes otherwise.
            data: manifest.text ?? manifest.data,
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
          if (!this.ofThisPresentation()) return;
          // What comes back is the whole presentation, not just the stream
          // this index resolved — and for a `SegmentBase` live stream it is
          // the first description with a measurable window, since the MPD
          // registers every stream with no segments at all.
          //
          // What it can reach is the next load, not this one: Shaka builds
          // the presentation timeline with the delay it has before it parses
          // the representations that send these index requests, and reuses
          // that timeline across refreshes. A `SegmentBase` live stream
          // therefore plays its first session at the pre-manifest delay. The
          // exception is low-latency DASH, where Shaka re-reads the delay on
          // every parse.
          const processed = this.core.processSegmentIndex({
            url: segmentUrl,
            byteRange,
            data: response.data,
          });
          if (processed) this.onManifestProcessed?.(processed);
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
          timeMs: downloadTimeMs(bandwidth, data.byteLength),
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
 * A manifest response's bytes without its `PatchLocation` elements. Shaka
 * hands its parser bytes rather than text, so this decodes and re-encodes —
 * as UTF-8, which is what Shaka assumes of a manifest without a byte order
 * mark — and returns the original bytes whenever there is nothing to remove
 * or they do not decode.
 */
function withoutPatchLocation(data: Response["data"]): {
  data: Response["data"];
  text?: string;
} {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return { data };
  }
  const stripped = stripPatchLocation(text);
  if (stripped === text) return { data, text };
  return { data: new TextEncoder().encode(stripped).buffer, text: stripped };
}
