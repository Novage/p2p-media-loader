import type {
  Loader,
  LoaderConfiguration,
  PlaylistLoaderContext,
  LoaderCallbacks,
  HlsConfig,
  LoaderStats,
} from "hls.js";
import { HybridLoader } from "p2p-media-loader-core";

export class PlaylistLoaderBase implements Loader<PlaylistLoaderContext> {
  context!: PlaylistLoaderContext;
  config!: LoaderConfiguration;
  callbacks!: LoaderCallbacks<PlaylistLoaderContext>;
  stats!: LoaderStats;
  hybridLoader: HybridLoader;
  defaultLoader: Loader<PlaylistLoaderContext>;

  constructor(config: HlsConfig, hybridLoader: HybridLoader) {
    this.hybridLoader = hybridLoader;
    this.defaultLoader = new config.loader(
      config
    ) as Loader<PlaylistLoaderContext>;
    this.stats = this.defaultLoader.stats;
  }

  load(
    context: PlaylistLoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<PlaylistLoaderContext>
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
