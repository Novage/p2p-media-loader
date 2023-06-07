import {
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderStats,
  FragmentLoaderContext,
  HlsConfig,
} from "hls.js";
import { HybridLoader } from "p2p-media-loader-core";

export class FragmentLoaderBase implements Loader<FragmentLoaderContext> {
  context!: FragmentLoaderContext;
  config!: LoaderConfiguration | null;
  callbacks!: LoaderCallbacks<FragmentLoaderContext> | null;
  stats: LoaderStats;
  hybridLoader: HybridLoader;
  response?: {
    segmentData: ArrayBuffer;
    responseUrl: string;
    status: number;
    statusText: string;
    ok: boolean;
  };

  constructor(config: HlsConfig, hybridLoader: HybridLoader) {
    this.hybridLoader = hybridLoader;
    this.stats = {
      aborted: false,
      buffering: { start: 0, end: 0, first: 0 },
      parsing: { start: 0, end: 0 },
      bwEstimate: 0,
      chunkCount: 0,
      loaded: 0,
      loading: { start: 0, end: 0, first: 0 },
      retry: 0,
      total: 0,
    };
  }

  async load(
    context: FragmentLoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<FragmentLoaderContext>
  ) {
    this.context = context;
    this.config = config;
    this.callbacks = callbacks;

    try {
      const { url: segmentUrl } = context;
      const { rangeStart, rangeEnd } = context;
      this.stats.loading.start = performance.now();
      this.response = await this.hybridLoader.loadSegment(segmentUrl, {
        rangeStart,
        rangeEnd,
      });

      if (!this.response.ok) {
        const { status, statusText } = this.response;
        throw new FetchError(
          statusText || "Fetch, bad network response",
          status,
          this.response
        );
      }

      this.stats.loading.first = performance.now();
      this.stats.loading.end = performance.now();
      const loaded = this.response.segmentData.byteLength;
      this.stats.loaded = loaded;
      this.stats.total = loaded;

      callbacks.onSuccess(
        {
          url: this.response.responseUrl,
          code: this.response.status,
          data: this.response.segmentData,
        },
        this.stats,
        context,
        this.response
      );
    } catch (error) {
      if (this.stats.aborted) return;

      if (error instanceof FetchError) {
        callbacks.onError(
          { code: error.code, text: error.message },
          context,
          error ? error.details : null,
          this.stats
        );
      }
    }
  }

  private abortInternal() {
    if (!this.response?.ok) {
      this.hybridLoader.abort();
      this.stats.aborted = true;
    }
  }

  abort() {
    this.abortInternal();
    this.callbacks?.onAbort?.(this.stats, this.context, {});
  }

  destroy() {
    this.callbacks = null;
    this.config = null;
    this.abortInternal();
  }
}

export class FetchError extends Error {
  public code: number;
  public details: unknown;

  constructor(message: string, code: number, details: object) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
