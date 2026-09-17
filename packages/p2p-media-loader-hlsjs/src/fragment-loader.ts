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
} from "p2p-media-loader-core";

const DEFAULT_DOWNLOAD_LATENCY = 10;

export class FragmentLoaderBase implements Loader<FragmentLoaderContext> {
  context!: FragmentLoaderContext;
  config!: LoaderConfiguration | null;
  stats: LoaderStats;
  #callbacks!: LoaderCallbacks<FragmentLoaderContext> | null;
  #createDefaultLoader: () => Loader<LoaderContext>;
  #defaultLoader?: Loader<LoaderContext>;
  #core: Core;
  #response?: SegmentResponse;
  #request?: { url: string; byteRange?: ByteRange };

  constructor(config: HlsConfig, core: Core) {
    this.#core = core;
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
    const byteRange = inclusiveByteRange(context.rangeStart, context.rangeEnd);
    this.#request = { url: context.url, byteRange };

    // Whitelist by lookup: a fragment the core's registry does not know, or
    // one whose stream has P2P disabled, loads through HLS.js's own loader.
    if (!this.#core.isSegmentLoadable(context.url, byteRange)) {
      this.#defaultLoader = this.#createDefaultLoader();
      this.#defaultLoader.stats = this.stats;
      this.#defaultLoader.load(context, config, callbacks);
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
      if (
        error instanceof CoreRequestError &&
        error.type === "aborted" &&
        this.stats.aborted
      ) {
        return;
      }
      this.#handleError(error);
    };

    this.#core.loadSegment(context.url, { byteRange }).then(onSuccess, onError);
  }

  #handleError(thrownError: unknown) {
    const error = { code: 0, text: "" };
    if (
      thrownError instanceof CoreRequestError &&
      thrownError.type === "failed"
    ) {
      // A core failure carries no HTTP status of its own: every source it
      // tried failed, and HLS.js reads the text.
      error.text = thrownError.message;
    } else if (thrownError instanceof Error) {
      error.text = thrownError.message;
    }
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
    if (this.#defaultLoader) {
      this.#defaultLoader.destroy();
    } else {
      if (!this.stats.aborted) this.#abortInternal();
      this.#callbacks = null;
      this.config = null;
    }
  }
}

function inclusiveByteRange(
  rangeStart: number | undefined,
  rangeEnd: number | undefined,
): ByteRange | undefined {
  if (rangeStart === undefined || rangeEnd === undefined) return undefined;
  if (rangeEnd <= rangeStart) return undefined;
  return { start: rangeStart, end: rangeEnd - 1 };
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
