import type {
  FragmentLoaderContext,
  HlsConfig,
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  LoaderStats,
} from "hls.js";
import * as Utils from "./utils.js";
import { Core, SegmentResponse, CoreRequestError } from "p2p-media-loader-core";

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
  #segmentId?: string;

  constructor(config: HlsConfig, core: Core) {
    this.#core = core;
    this.#createDefaultLoader = () => new config.loader(config);
    this.stats = {
      aborted: false,
      chunkCount: 0,
      loading: { start: 0, first: 0, end: 0 },
      buffering: { start: 0, first: 0, end: 0 },
      parsing: { start: 0, end: 0 },
      // set total and loaded to 1 to prevent hls.js
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
    const stats = this.stats;

    const { rangeStart: start, rangeEnd: end } = context;
    const byteRange = Utils.getByteRange(
      start,
      end !== undefined ? end - 1 : undefined,
    );

    this.#segmentId = Utils.getSegmentRuntimeId(context.url, byteRange);
    const isSegmentDownloadableByP2PCore = this.#core.isSegmentLoadable(
      this.#segmentId,
    );

    if (
      !this.#core.hasSegment(this.#segmentId) ||
      isSegmentDownloadableByP2PCore === false
    ) {
      this.#defaultLoader = this.#createDefaultLoader();
      this.#defaultLoader.stats = this.stats;
      this.#defaultLoader?.load(context, config, callbacks);
      return;
    }

    const onSuccess = (response: SegmentResponse) => {
      this.#response = response;
      const loadedBytes = this.#response.data.byteLength;
      stats.loading = getLoadingStat(
        this.#response.bandwidth,
        loadedBytes,
        performance.now(),
      );
      stats.total = stats.loaded = loadedBytes;

      if (callbacks.onProgress) {
        callbacks.onProgress(
          this.stats,
          context,
          this.#response.data,
          undefined,
        );
      }
      callbacks.onSuccess(
        { data: this.#response.data, url: context.url },
        this.stats,
        context,
        undefined,
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

    void this.#core.loadSegment(this.#segmentId, { onSuccess, onError });
  }

  #handleError(thrownError: unknown) {
    const error = { code: 0, text: "" };
    if (
      thrownError instanceof CoreRequestError &&
      thrownError.type === "failed"
    ) {
      // error.code = thrownError.code;
      error.text = thrownError.message;
    } else if (thrownError instanceof Error) {
      error.text = thrownError.message;
    }
    this.#callbacks?.onError(error, this.context, null, this.stats);
  }

  #abortInternal() {
    if (!this.#response && this.#segmentId) {
      this.stats.aborted = true;
      this.#core.abortSegmentLoading(this.#segmentId);
    }
  }

  abort() {
    if (this.#defaultLoader) {
      this.#defaultLoader.abort();
    } else {
      this.#abortInternal();
      this.#callbacks?.onAbort?.(this.stats, this.context, {});
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

function getLoadingStat(
  targetBitrate: number,
  loadedBytes: number,
  loadingEndTime: number,
) {
  const timeForLoading = (loadedBytes * 8000) / targetBitrate;
  const first = loadingEndTime - timeForLoading;
  const start = first - DEFAULT_DOWNLOAD_LATENCY;

  return { start, first, end: loadingEndTime };
}
