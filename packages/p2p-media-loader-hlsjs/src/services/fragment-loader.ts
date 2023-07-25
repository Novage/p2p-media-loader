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
    fetchResponse: Response;
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
      total: 0,
      loaded: 0,
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
      this.stats = this.defaultLoader.stats;
      this.defaultLoader?.load(context, config, callbacks);
      return;
    }

    try {
      const byteRange = getByteRange(context.rangeStart, context.rangeEnd);
      this.response = await this.fetchSegment(context.url, byteRange);
    } catch (error) {
      if (!this.stats.aborted) {
        return this.handleError(error as { code: number; text: string });
      }
    }
    if (!this.response) return;
    const loadedBytes = this.response.data.byteLength;

    stats.loading = getLoadingStat({
      targetBitrate: 630000 * 1.1,
      loadingEndTime: performance.now(),
      loadedBytes,
    });
    stats.total = stats.loaded = loadedBytes;

    const { start, first, end } = stats.loading;
    const latency = first - start;
    const loadingTime = end - first;
    const bandwidth = (stats.loaded * 8) / (loadingTime / 1000) / 1000;
    console.log("latency: ", latency);
    console.log("loading: ", loadingTime);
    console.log("bandwidth: ", bandwidth);
    console.log("loaded: ", stats.loaded);
    console.log("");

    callbacks.onSuccess(
      this.response,
      this.stats,
      context,
      this.response.fetchResponse
    );
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
    this.stats.loading.start = performance.now();
    const response = await fetch(segmentUrl, {
      headers,
      signal: this.abortController.signal,
    });
    this.stats.loading.first = performance.now();
    const data = await response.arrayBuffer();
    this.stats.loading.end = performance.now();
    return {
      ok: response.ok,
      status: response.status,
      data,
      url: response.url,
      fetchResponse: response,
    };
  }

  private handleError(error: { code: number; text: string }) {
    this.callbacks?.onError(error, this.context, undefined, this.stats);
  }

  private abortInternal() {
    if (!this.response?.ok) {
      this.abortController.abort();
      this.stats.aborted = true;
    }
  }

  abort() {
    if (this.defaultLoader) {
      this.defaultLoader?.abort();
    } else {
      this.abortInternal();
      this.callbacks?.onAbort?.(this.stats, this.context, {});
    }
  }

  destroy() {
    if (this.defaultLoader) {
      this.defaultLoader?.destroy();
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
  const bites = loadedBytes * 8;
  const timeForLoading = (bites / targetBitrate) * 1000;
  const start = loadingEndTime - timeForLoading - DEFAULT_DOWNLOAD_LATENCY;
  const first = loadingEndTime - timeForLoading;

  return { start, first, end: loadingEndTime };
}
