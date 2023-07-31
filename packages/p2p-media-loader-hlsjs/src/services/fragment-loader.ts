import type {
  FragmentLoaderContext,
  HlsConfig,
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  LoaderStats,
} from "hls.js";
import { SegmentManager } from "./segment-mananger";
import { ByteRange, Segment } from "./playlist";
import Debug from "debug";

const DEFAULT_DOWNLOAD_LATENCY = 10;

export class FragmentLoaderBase implements Loader<FragmentLoaderContext> {
  context!: FragmentLoaderContext;
  config!: LoaderConfiguration | null;
  callbacks!: LoaderCallbacks<FragmentLoaderContext> | null;
  stats: LoaderStats;
  createDefaultLoader: () => Loader<LoaderContext>;
  defaultLoader?: Loader<LoaderContext>;
  segmentManager: SegmentManager;
  response?: {
    status: number;
    ok: boolean;
    url: string;
    data: ArrayBuffer;
  };
  abortController: AbortController = new AbortController();
  private debug = Debug("hls:fragment-loading");

  constructor(config: HlsConfig, segmentManager: SegmentManager) {
    this.segmentManager = segmentManager;
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

    const playlist = this.identifyPlaylist(context);
    if (!playlist) {
      this.defaultLoader = this.createDefaultLoader();
      this.defaultLoader.stats = this.stats;
      this.defaultLoader?.load(context, config, callbacks);
      return;
    }

    try {
      const byteRange = getByteRange(context.rangeStart, context.rangeEnd);
      this.response = await this.fetchSegment(context.url, byteRange);
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

  private identifyPlaylist(context: LoaderContext) {
    const { rangeStart: start, rangeEnd: end } = context;
    const segmentId = Segment.getSegmentLocalId(context.url, {
      start,
      end,
    });
    const playlist = this.segmentManager.getPlaylistBySegmentId(segmentId);
    this.debug(
      "downloaded segment from playlist\n",
      `playlist v: ${playlist?.index}\n`,
      `segment: `,
      playlist?.segments.get(segmentId)?.index
    );
    return playlist;
  }

  async fetchSegment(segmentUrl: string, byteRange?: ByteRange) {
    const headers = new Headers();

    if (byteRange) {
      const { start, end } = byteRange;
      const byteRangeString = `bytes=${start}-${end}`;
      headers.set("Range", byteRangeString);
    }
    const response = await fetch(segmentUrl, {
      headers,
      signal: this.abortController.signal,
    });
    if (!response.ok) {
      throw new FetchError(
        response.statusText ?? "Fetch, bad network response",
        response.status,
        response
      );
    }
    const data = await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status,
      data,
      url: response.url,
    };
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
    if (!this.response?.ok) {
      this.abortController.abort();
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

function getByteRange(
  start: number | undefined,
  end: number | undefined
): ByteRange | undefined {
  if (start !== undefined && end !== undefined && end > start) {
    return { start, end: end - 1 };
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

class FetchError extends Error {
  public code: number;
  public details: object;

  constructor(message: string, code: number, details: object) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
