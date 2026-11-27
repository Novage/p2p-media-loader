import type {
  FragmentLoaderContext,
  HlsConfig,
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  LoaderStats,
} from "hls.js";
import {
  Core,
  SegmentResponse,
  CoreRequestError,
  ByteRange,
  byteRangeFromHalfOpen,
} from "p2p-media-loader-core";
import { isSecondaryPlayer } from "./secondary-player.js";
import { diagnostics } from "./diagnostics.js";

const DEFAULT_DOWNLOAD_LATENCY = 10;

/**
 * The status a core failure is reported with when it has no HTTP status to
 * give: a timeout, a network error, a refusal of a range the core asked for
 * itself, a peer's failure with HTTP off, or a storage fault (the cases of
 * `Core.loadSegment`'s `@throws`). HLS.js retries a fragment by its status,
 * and never one with none — status 0 reads as a CORS failure — so on a
 * stream of one rendition the first such failure would be fatal. A gateway
 * that could not get the segment from upstream is what the adapter is, and
 * 502 is what HLS.js's own loader would report for that, so its
 * `fragLoadPolicy.errorRetry` applies as it would without P2P.
 */
const CORE_FAILURE_STATUS = 502;

export class FragmentLoaderBase implements Loader<FragmentLoaderContext> {
  context!: FragmentLoaderContext;
  config!: LoaderConfiguration | null;
  stats: LoaderStats;
  #callbacks!: LoaderCallbacks<FragmentLoaderContext> | null;
  #createDefaultLoader: () => Loader<LoaderContext>;
  #defaultLoader?: Loader<LoaderContext>;
  #core: Core;
  readonly #reportPlayback: () => void;
  #response?: SegmentResponse;
  #request?: { url: string; byteRange?: ByteRange };
  readonly #ofAnotherPlayer: boolean;

  readonly #diagnosticsToken = diagnostics?.open("HlsFragmentLoader");

  /**
   * @param reportPlayback - Reports the player's buffer to the core now. Called
   * just before each segment request: HLS.js asks for the next fragment right
   * after it appends one, and no media element event has reported the
   * append yet.
   */
  constructor(
    config: HlsConfig,
    core: Core,
    reportPlayback: () => void = () => undefined,
  ) {
    this.#core = core;
    this.#reportPlayback = reportPlayback;
    this.#ofAnotherPlayer = isSecondaryPlayer(config);
    this.#createDefaultLoader = () => new config.loader(config);
    this.stats = {
      aborted: false,
      chunkCount: 0,
      loading: { start: 0, first: 0, end: 0 },
      buffering: { start: 0, first: 0, end: 0 },
      parsing: { start: 0, end: 0 },
      // set total and loaded to 1 to prevent HLS.js
      // on progress loading monitoring in AbrController
      total: 1,
      loaded: 1,
      bwEstimate: 0,
      retry: 0,
    };
  }

  load(
    context: FragmentLoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>,
  ) {
    this.context = context;
    this.config = config;
    this.#callbacks = callbacks;
    const { stats } = this;

    // HLS.js carries a half-open [rangeStart, rangeEnd); the core keys
    // segments by the inclusive range the playlist declared.
    const byteRange = byteRangeFromHalfOpen(
      context.rangeStart,
      context.rangeEnd,
    );
    this.#request = { url: context.url, byteRange };

    // Whitelist by lookup: a fragment the core's registry does not know, or
    // one whose stream has P2P disabled, loads through HLS.js's own loader —
    // as does every fragment of an interstitial's own player, whose segments
    // are not the ones this core holds.
    if (
      this.#ofAnotherPlayer ||
      !this.#core.isSegmentLoadable(context.url, byteRange)
    ) {
      this.#loadByDefaultLoader(context, config, callbacks);
      return;
    }

    const onSuccess = (response: SegmentResponse) => {
      // `abort` reports the fragment as aborted and leaves the callbacks in
      // place for HLS.js to tear down, so a response that arrives after it —
      // the core cannot always cancel in time — is delivered to nobody.
      if (!this.#callbacks || stats.aborted) return;

      this.#response = response;
      const loadedBytes = this.#response.data.byteLength;
      stats.loading = getLoadingStat(
        this.#response.bandwidth,
        loadedBytes,
        performance.now(),
      );
      stats.total = loadedBytes;
      stats.loaded = loadedBytes;

      // HLS.js transfers this buffer to its transmuxing worker, which detaches
      // it. That is safe: what the core hands over is already the engine's own
      // copy, and what it seeds to peers is a buffer no consumer ever sees.
      const engineData = this.#response.data;

      if (this.#callbacks.onProgress) {
        this.#callbacks.onProgress(this.stats, context, engineData, null);
      }
      this.#callbacks.onSuccess(
        { data: engineData, url: context.url },
        this.stats,
        context,
        null,
      );
    };

    const onError = (error: unknown) => {
      // HLS.js aborted it, and has let it go.
      if (this.stats.aborted) return;
      if (error instanceof CoreRequestError && error.type === "failed") {
        this.#handleError(error);
        return;
      }
      this.#loadByHlsJsInstead(context, config, callbacks, error);
    };

    this.#reportPlayback();
    this.#core.loadSegment(context.url, { byteRange }).then(onSuccess, onError);
  }

  /**
   * The core gave the fragment up without failing it at the origin: it
   * stopped a fragment HLS.js never asked to stop — P2P turned off for the
   * stream, the core destroyed — or it threw — a segment the live window
   * left while the storage started, a storage that failed to start. HLS.js
   * is still waiting for it, and an error would count against the fragment
   * — on a stream of one rendition, a fatal one — and send its retries to
   * the same core. So it is loaded by HLS.js's own loader instead, as a
   * fragment the core does not serve is.
   */
  #loadByHlsJsInstead(
    context: FragmentLoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>,
    error: unknown,
  ) {
    // Destroyed meanwhile: HLS.js has let the fragment go.
    if (!this.#callbacks) return;
    diagnostics?.count(
      error instanceof CoreRequestError
        ? "HlsFragment:core-abort-to-hlsjs"
        : "HlsFragment:core-throw-to-hlsjs",
    );
    this.#request = undefined;
    this.#loadByDefaultLoader(context, config, callbacks);
  }

  /** Loads the fragment by HLS.js's own loader, into this loader's stats. */
  #loadByDefaultLoader(
    context: FragmentLoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>,
  ) {
    this.#defaultLoader = this.#createDefaultLoader();
    this.#defaultLoader.stats = this.stats;
    this.#defaultLoader.load(context, config, callbacks);
  }

  #handleError(failure: CoreRequestError) {
    // The status of the core's one HTTP attempt, as HLS.js's own loader
    // would report it: HLS.js retries by it, a 404 not at all. The core
    // leaves the retries to HLS.js.
    const error = {
      code: failure.httpStatus ?? CORE_FAILURE_STATUS,
      text: failure.message,
    };
    this.#callbacks?.onError(error, this.context, null, this.stats);
  }

  #abortInternal() {
    if (!this.#response && this.#request) {
      this.stats.aborted = true;
      this.#core.abortSegmentLoading(
        this.#request.url,
        this.#request.byteRange,
      );
    }
  }

  abort() {
    if (this.#defaultLoader) {
      this.#defaultLoader.abort();
    } else {
      this.#abortInternal();
      this.#callbacks?.onAbort?.(this.stats, this.context, null);
    }
  }

  destroy() {
    diagnostics?.close(this.#diagnosticsToken, "destroyed");
    if (this.#defaultLoader) {
      this.#defaultLoader.destroy();
    } else {
      if (!this.stats.aborted) this.#abortInternal();
      this.#callbacks = null;
      this.config = null;
    }
  }
}

function getLoadingStat(
  targetBitrate: number,
  loadedBytes: number,
  loadingEndTime: number,
) {
  const timeForLoading =
    targetBitrate > 0 ? (loadedBytes * 8000) / targetBitrate : 0;
  const first = Math.max(0, loadingEndTime - timeForLoading);
  const start = Math.max(0, first - DEFAULT_DOWNLOAD_LATENCY);

  return { start, first, end: loadingEndTime };
}
