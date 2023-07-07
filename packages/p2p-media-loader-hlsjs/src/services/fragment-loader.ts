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

let prev: string | undefined;

export class FragmentLoaderBase implements Loader<FragmentLoaderContext> {
  context!: FragmentLoaderContext;
  config!: LoaderConfiguration | null;
  callbacks!: LoaderCallbacks<FragmentLoaderContext> | null;
  stats: LoaderStats;
  defaultLoader: Loader<LoaderContext>;
  segmentManager: SegmentManager;
  private debug = Debug("hls:fragment-loading");

  constructor(config: HlsConfig, segmentManager: SegmentManager) {
    this.segmentManager = segmentManager;
    this.defaultLoader = new config.loader(config);
    this.stats = this.defaultLoader.stats;
    // this.stats = {
    //   loading: { start: 0, end: 0, first: 0 },
    //   total: 0,
    //   loaded: 0,
    //   bwEstimate: 0,
    //   buffering: { start: 0, end: 0, first: 0 },
    //   aborted: false,
    //   retry: 0,
    //   parsing: { start: 0, end: 0 },
    //   chunkCount: 0,
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

    this.identifyPlaylist(context);
    let byteRange: ByteRange | undefined;
    const { rangeStart, rangeEnd } = context;
    if (
      rangeStart !== undefined &&
      rangeEnd !== undefined &&
      rangeEnd > rangeStart
    ) {
      byteRange = { start: rangeStart, end: rangeEnd };
    }
    const response = await this.fetchSegment(context.url, byteRange);
    const { loading } = stats;
    const loadedBytes = response.data.byteLength;
    loading.first = performance.now();
    loading.end = performance.now() + 1;

    const { bandwidth, loadingStartTime } =
      this.getLoadingStartByTargetBandwidth({
        targetLevelBandwidth: 460560,
        aboveLevelBandwidth: 836280,
        loadingEndTime: loading.first,
        loadedBytes,
      });

    console.log("bandwidth", bandwidth);
    loading.start = loadingStartTime;
    stats.bwEstimate = bandwidth;
    stats.total = stats.loaded = loadedBytes;

    callbacks.onSuccess(
      {
        url: response.url,
        code: response.status,
        data: response.data,
      },
      this.stats,
      context,
      response
    );
  }

  private identifyPlaylist(context: LoaderContext) {
    const { rangeStart: start, rangeEnd: end } = context;
    const segmentId = Segment.getSegmentLocalId(context.url, {
      start,
      end,
    });
    const prevPlaylist = prev
      ? this.segmentManager.getPlaylistBySegmentId(prev)
      : undefined;

    const playlist = this.segmentManager.getPlaylistBySegmentId(segmentId);
    prev = segmentId;
    console.log("");
    console.log("PREV_PLAYLIST", prevPlaylist?.index);
    console.log(context.url);
    // console.log("SEGMENT_ID: ", segmentId);
    console.log("PLAYLIST_INDEX: ", playlist?.index);
    console.log("PLAYLIST_TYPE: ", playlist?.type);
    this.debug(
      "downloaded segment from playlist\n",
      `playlist v: ${playlist?.index}\n`,
      `segment: `,
      playlist?.segments.get(segmentId)?.index,
      `bitrate: ${playlist?.bitrate}`
    );
  }

  getLoadingStartByTargetBandwidth({
    loadedBytes,
    targetLevelBandwidth,
    aboveLevelBandwidth,
    loadingEndTime,
  }: {
    targetLevelBandwidth: number;
    aboveLevelBandwidth: number;
    loadingEndTime: number;
    loadedBytes: number;
  }) {
    const bites = loadedBytes * 8;
    const levelBandwidthDiff = aboveLevelBandwidth - targetLevelBandwidth;
    const targetBandwidth = Math.round(
      targetLevelBandwidth + levelBandwidthDiff * 0.4
    );
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
    const response = await fetch(segmentUrl, { headers });
    const data = await response.arrayBuffer();
    const { status, url } = response;

    return { status, data, url };
  }

  abort() {
    this.defaultLoader.abort();
  }

  destroy() {
    this.defaultLoader.destroy();
  }
}
