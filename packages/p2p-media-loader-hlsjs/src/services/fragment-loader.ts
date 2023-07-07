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
  defaultLoader: Loader<LoaderContext>;
  segmentManager: SegmentManager;
  response?: { status: number; data: ArrayBuffer; url: string; ok: boolean };
  abortController: AbortController = new AbortController();
  private debug = Debug("hls:fragment-loading");

  constructor(config: HlsConfig, segmentManager: SegmentManager) {
    this.segmentManager = segmentManager;
    this.defaultLoader = new config.loader(config);
    this.stats = this.defaultLoader.stats;
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
      return this.defaultLoader.load(context, config, callbacks);
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
    this.response = await this.fetchSegment(context.url, byteRange);
    const { loading } = stats;
    const loadedBytes = this.response.data.byteLength;
    loading.first = performance.now();
    loading.end = performance.now() + 1;

    const { bandwidth, loadingStartTime } = this.getLoadingStatByTargetBitrate({
      targetLevelBitrate: 1650064,
      aboveLevelBitrate: 2749539,
      loadingEndTime: loading.first,
      loadedBytes,
    });

    loading.start = loadingStartTime;
    stats.bwEstimate = bandwidth;
    stats.total = stats.loaded = loadedBytes;

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
      playlist?.segments.get(segmentId)?.index,
      `bitrate: ${playlist?.bitrate}`
    );
    return playlist;
  }

  getLoadingStatByTargetBitrate({
    loadedBytes,
    targetLevelBitrate,
    aboveLevelBitrate,
    loadingEndTime,
  }: {
    targetLevelBitrate: number;
    aboveLevelBitrate: number;
    loadingEndTime: number;
    loadedBytes: number;
  }) {
    const bites = loadedBytes * 8;
    const bitrateDiff = aboveLevelBitrate - targetLevelBitrate;
    const targetBandwidth = Math.round(targetLevelBitrate + bitrateDiff * 0.4);
    const timeForLoading = Math.round((bites / targetBandwidth) * 1000);
    const loadingStartTime = loadingEndTime - timeForLoading;
    return { loadingStartTime, bandwidth: targetBandwidth };
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
    const data = await response.arrayBuffer();
    const { status, url, ok } = response;

    return { status, data, url, ok };
  }

  private abortInternal() {
    if (!this.response?.ok) {
      this.abortController.abort();
      this.stats.aborted = true;
    }
  }

  abort() {
    this.abortInternal();
    this.callbacks?.onAbort?.(this.stats, this.context, {});
    this.defaultLoader.abort();
  }

  destroy() {
    this.defaultLoader.destroy();
    this.abortInternal();
    this.callbacks = null;
    this.config = null;
  }
}
