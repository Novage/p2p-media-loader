import type {
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderStats,
  FragmentLoaderContext,
  HlsConfig,
  LoaderContext,
} from "hls.js";
import { SegmentManager } from "./segment-mananger";
import { Segment, ByteRange } from "./playlist";
import Debug from "debug";

export class FragmentLoaderBase implements Loader<FragmentLoaderContext> {
  context!: FragmentLoaderContext;
  config!: LoaderConfiguration | null;
  callbacks!: LoaderCallbacks<FragmentLoaderContext> | null;
  stats: LoaderStats;
  defaultLoader: Loader<LoaderContext>;
  segmentManager: SegmentManager;
  private debug = Debug("p2pml:fragment-loader");

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
    this.defaultLoader.load(context, config, {
      ...callbacks,
      onSuccess: (response, stats, context, networkDetails) => {
        const { rangeStart: start, rangeEnd: end } = context;
        const segmentId = Segment.getSegmentLocalId(context.url, {
          start,
          end: end !== undefined ? end - 1 : undefined,
        });
        const playlist = this.segmentManager.getPlaylistBySegmentId(segmentId);
        this.debug(
          "downloaded segment from playlist\n",
          `playlist v: ${playlist?.index}\n`,
          `segment: `,
          playlist?.segmentsMap.get(segmentId)?.sequence
        );
        const type = "video";
        if (playlist?.type === type) {
          const segment = playlist?.segmentsMap.get(segmentId);
          console.log(context.url);
          console.log(playlist?.id, segment?.sequence, segment?.byteRange);
          console.log("");
        }

        return callbacks.onSuccess(response, stats, context, networkDetails);
      },
    });
  }

  abort() {
    this.defaultLoader.abort();
  }

  destroy() {
    this.defaultLoader.destroy();
  }
}
