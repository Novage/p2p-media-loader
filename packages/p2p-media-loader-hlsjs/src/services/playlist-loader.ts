import type {
  Loader,
  LoaderConfiguration,
  PlaylistLoaderContext,
  LoaderCallbacks,
  HlsConfig,
  LoaderStats,
  LoaderContext,
} from "hls.js";

export class PlaylistLoaderBase implements Loader<PlaylistLoaderContext> {
  context!: PlaylistLoaderContext;
  config!: LoaderConfiguration;
  callbacks!: LoaderCallbacks<PlaylistLoaderContext>;
  stats!: LoaderStats;
  defaultLoader: Loader<LoaderContext>;

  constructor(config: HlsConfig) {
    this.defaultLoader = new config.loader(config);
    this.stats = this.defaultLoader.stats;
  }

  load(
    context: PlaylistLoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>
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

  getCacheAge() {
    return this.defaultLoader.getCacheAge?.() ?? null;
  }

  getResponseHeader(name: string) {
    return this.defaultLoader.getResponseHeader?.(name) ?? null;
  }
}
