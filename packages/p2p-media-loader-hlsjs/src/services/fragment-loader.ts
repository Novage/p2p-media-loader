import type {
  FragmentLoaderContext,
  HlsConfig,
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  LoaderStats,
} from "hls.js";
import { Segment, Stream } from "./playlist";
import { Core, FetchError } from "p2p-media-loader-core";

const DEFAULT_DOWNLOAD_LATENCY = 10;

export class FragmentLoaderBase implements Loader<FragmentLoaderContext> {
  context!: FragmentLoaderContext;
  config!: LoaderConfiguration | null;
  callbacks!: LoaderCallbacks<FragmentLoaderContext> | null;
  stats: LoaderStats;
  createDefaultLoader: () => Loader<LoaderContext>;
  defaultLoader?: Loader<LoaderContext>;
  core: Core<Segment, Stream>;
  response?: {
    status: number;
    ok: boolean;
    url: string;
    data: ArrayBuffer;
  };
  segmentId?: string;

  constructor(config: HlsConfig, core: Core<Segment, Stream>) {
    this.core = core;
    this.createDefaultLoader = () => new config.loader(config);
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

  async load(
    context: FragmentLoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>
  ) {
    this.context = context;
    this.config = config;
    this.callbacks = callbacks;
    const stats = this.stats;

    const { rangeStart: start, rangeEnd: end } = context;
    this.segmentId = Segment.getSegmentLocalId(context.url, {
      start,
      end,
    });

    if (!this.core.hasSegment(this.segmentId)) {
      this.defaultLoader = this.createDefaultLoader();
      this.defaultLoader.stats = this.stats;
      this.defaultLoader?.load(context, config, callbacks);
      return;
    }

    try {
      this.response = await this.core.loadSegment(this.segmentId);
    } catch (error) {
      if (this.stats.aborted) return;
      return this.handleError(error);
    }
    if (!this.response) return;
    const loadedBytes = this.response.data.byteLength;

    stats.loading = getLoadingStat({
      targetBitrate: 4947980 * (10 / 6.8),
      loadingEndTime: performance.now(),
      loadedBytes,
    });
    stats.total = stats.loaded = loadedBytes;

    callbacks.onSuccess(this.response, this.stats, context, this.response);
  }

  private handleError(thrownError: unknown) {
    const error = { code: 0, text: "" };
    let details: object | null = null;
    if (thrownError instanceof FetchError) {
      error.code = thrownError.code;
      error.text = thrownError.message;
      details = thrownError.details;
    } else if (thrownError instanceof Error) {
      error.text = thrownError.message;
    }
    this.callbacks?.onError(error, this.context, details, this.stats);
  }

  private abortInternal() {
    if (!this.response?.ok && this.segmentId) {
      this.core.abortSegmentLoading(this.segmentId);
      this.stats.aborted = true;
    }
  }

  abort() {
    if (this.defaultLoader) {
      this.defaultLoader.abort();
    } else {
      this.abortInternal();
      this.callbacks?.onAbort?.(this.stats, this.context, {});
    }
  }

  destroy() {
    if (this.defaultLoader) {
      this.defaultLoader.destroy();
    } else {
      this.abortInternal();
      this.callbacks = null;
      this.config = null;
    }
  }
}

function getLoadingStat({
  loadedBytes,
  targetBitrate,
  loadingEndTime,
}: {
  targetBitrate: number;
  loadedBytes: number;
  loadingEndTime: number;
}) {
  const bits = loadedBytes * 8;
  const timeForLoading = (bits / targetBitrate) * 1000;
  const first = loadingEndTime - timeForLoading;
  const start = first - DEFAULT_DOWNLOAD_LATENCY;

  return { start, first, end: loadingEndTime };
}
