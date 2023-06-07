import {
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderStats,
  FragmentLoaderContext,
  HlsConfig,
} from "hls.js";
import { SegmentManager } from "./engine";

export class FragmentLoaderBase implements Loader<FragmentLoaderContext> {
  context!: FragmentLoaderContext;
  config!: LoaderConfiguration;
  callbacks!: LoaderCallbacks<FragmentLoaderContext>;
  stats: LoaderStats;
  segmentManager: SegmentManager;
  defaultLoader: Loader<FragmentLoaderContext>;

  constructor(config: HlsConfig, segmentManager: SegmentManager) {
    this.segmentManager = segmentManager;
    this.defaultLoader = new config.loader(
      config
    ) as Loader<FragmentLoaderContext>;
    this.stats = this.defaultLoader.stats;
  }

  load(
    context: FragmentLoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<FragmentLoaderContext>
  ) {
    this.context = context;
    this.config = config;
    this.callbacks = callbacks;
    this.defaultLoader.load(context, config, callbacks);
  }

  abort() {
    this.defaultLoader.abort();
  }

  destroy() {
    this.defaultLoader.destroy();
  }
}
