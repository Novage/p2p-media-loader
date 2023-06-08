import type {
  Loader,
  LoaderConfiguration,
  PlaylistLoaderContext,
  LoaderCallbacks,
  HlsConfig,
  LoaderStats,
  LoaderContext,
} from "hls.js";
import { SegmentManager } from "./segment-mananger";

export class PlaylistLoaderBase implements Loader<PlaylistLoaderContext> {
  context!: PlaylistLoaderContext;
  config!: LoaderConfiguration;
  callbacks!: LoaderCallbacks<PlaylistLoaderContext>;
  stats: LoaderStats;
  defaultLoader: Loader<LoaderContext>;
  segmentManager: SegmentManager;

  constructor(config: HlsConfig, segmentManager: SegmentManager) {
    this.defaultLoader = new config.loader(config);
    this.stats = this.defaultLoader.stats;
    this.segmentManager = segmentManager;
  }

  load(
    context: PlaylistLoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>
  ) {
    this.context = context;
    this.config = config;
    this.callbacks = callbacks;
    this.defaultLoader.load(context, config, {
      ...callbacks,
      onSuccess: (response, stats, context, networkDetails) => {
        console.log(response);
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

  getCacheAge() {
    return this.defaultLoader.getCacheAge?.() || null;
  }

  getResponseHeader(name: string) {
    return this.defaultLoader.getResponseHeader?.(name) || null;
  }
}
