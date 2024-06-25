import {
  HlsConfig,
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  LoaderStats,
  PlaylistLoaderContext,
} from "hls.js";

export class PlaylistLoaderBase implements Loader<PlaylistLoaderContext> {
  #defaultLoader: Loader<LoaderContext>;
  context: PlaylistLoaderContext;
  stats: LoaderStats;

  constructor(config: HlsConfig) {
    this.#defaultLoader = new config.loader(config);
    this.stats = this.#defaultLoader.stats;
    this.context = this.#defaultLoader.context as PlaylistLoaderContext;
  }

  load(
    context: LoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>,
  ) {
    this.#defaultLoader.load(context, config, callbacks);
  }

  abort() {
    this.#defaultLoader.abort();
  }

  destroy() {
    this.#defaultLoader.destroy();
  }
}
