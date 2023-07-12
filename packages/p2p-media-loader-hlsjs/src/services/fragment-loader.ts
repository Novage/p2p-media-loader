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

export class FragmentLoaderBase implements Loader<FragmentLoaderContext> {
  context!: FragmentLoaderContext;
  config!: LoaderConfiguration | null;
  callbacks!: LoaderCallbacks<FragmentLoaderContext> | null;
  stats: LoaderStats;
  createDefaultLoader: () => Loader<LoaderContext>;
  defaultLoader?: Loader<LoaderContext>;
  segmentManager: SegmentManager;
  response?: { status: number; ok: boolean; url: string; data: ArrayBuffer };
  abortController: AbortController = new AbortController();
  private debug = Debug("hls:fragment-loading");

  constructor(config: HlsConfig, segmentManager: SegmentManager) {
    this.segmentManager = segmentManager;
    this.createDefaultLoader = () => new config.loader(config);
    this.stats = {
      aborted: false,
      chunkCount: 0,
      loading: { start: 0, first: 0, end: 0 },
      buffering: new Proxy(
        { start: 0, first: 0, end: 0, addToStart: 0 },
        handler
      ),
      parsing: new Proxy({ start: 0, end: 0, addToStart: 0 }, handler),
      total: 0,
      loaded: 0,
      bwEstimate: 0,
      retry: 0,
    } as any;
    // this.stats = {
    //   aborted: false,
    //   chunkCount: 0,
    //   loading: { start: 0, first: 0, end: 0 },
    //   buffering: { start: 0, first: 0, end: 0 },
    //   parsing: { start: 0, end: 0 },
    //   total: 0,
    //   loaded: 0,
    //   bwEstimate: 0,
    //   retry: 0,
    // };
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

    console.log(context.url);
    const playlist = this.identifyPlaylist(context);
    if (!playlist) {
      this.defaultLoader = this.createDefaultLoader();
      this.stats = this.defaultLoader.stats;
      this.defaultLoader?.load(context, config, callbacks);
      return;
    }

    let byteRange: ByteRange | undefined;
    const { rangeStart, rangeEnd } = context;
    if (
      rangeStart !== undefined &&
      rangeEnd !== undefined &&
      rangeEnd > rangeStart
    ) {
      byteRange = { start: rangeStart, end: rangeEnd };
    }
    try {
      this.response = await this.fetchSegment(context.url, byteRange);
    } catch (error) {
      if (!this.stats.aborted) {
        return this.handleError(error as { code: number; text: string });
      }
    }
    if (!this.response) return;
    const loadedBytes = this.response.data.byteLength;

    const { addToStart, ...loading } = getLoadingStat({
      targetBitrate: 895755 * 1.1,
      loadingEndTime: performance.now(),
      loadedBytes,
    });
    (stats.parsing as any).addToStart = addToStart;
    (stats.buffering as any).addToStart = addToStart;
    stats.loading = loading;
    stats.total = stats.loaded = loadedBytes;

    // console.log(stats.loading);
    const { start, first, end } = stats.loading;
    const latency = first - start;
    const loadingTime = end - first;
    const bandwidth = (stats.loaded * 8) / (loadingTime / 1000) / 1000;
    // console.log("latency: ", latency);
    // console.log("loading: ", loadingTime);
    // console.log("bandwidth: ", bandwidth);
    // console.log("loaded: ", stats.loaded);
    this.stats.bwEstimate = 1;
    // console.log(this.stats);
    // console.log("");

    callbacks.onSuccess(
      {
        url: this.response.url,
        code: this.response.status,
        data: this.response.data,
      },
      this.stats,
      context,
      this.response
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
    };
  }

  private abortInternal() {
    // if (!this.response?.ok) {
    //   this.abortController.abort();
    //   this.stats.aborted = true;S
    // }
  }

  private handleError(error: { code: number; text: string }) {
    this.callbacks?.onError(error, this.context, undefined, this.stats);
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

const DEFAULT_DOWNLOAD_LATENCY = 50;

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
  let start = loadingEndTime - timeForLoading - getRandomNumberInRange(20, 200);
  let first = loadingEndTime - timeForLoading;
  let end = loadingEndTime;
  let addToStart: number | undefined = undefined;

  if (start < 0) {
    first += -start;
    end += -start;
    addToStart = -start;
    start = 0;
  }

  return { start, first, end, addToStart };
}

function getRandomNumberInRange(min: number, max: number): number {
  // Generate a random number between 0 and 1
  const random = Math.random();

  // Scale the random number to fit within the range
  const scaled = random * (max - min + 1);

  // Shift the scaled number to the appropriate range starting from the minimum value
  const result = Math.floor(scaled) + min;

  return result;
}

const handler = {
  set<T extends object, P extends keyof T>(
    target: T,
    property: P,
    value: T[P]
  ) {
    if (
      typeof (target as { addToStart?: unknown }).addToStart === "number" &&
      typeof target[property] === "number" &&
      typeof value === "number"
    ) {
      (target[property] as number) =
        value + (target as { addToStart: number }).addToStart;
    }
    return true;
  },
};
