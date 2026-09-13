import {
  HlsConfig,
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  LoaderStats,
  PlaylistLoaderContext,
} from "hls.js";
import { Core } from "p2p-media-loader-core";

/**
 * Wraps hls.js's own playlist loader so every manifest it fetches is also
 * handed to the core. Loading itself is untouched: the core observes the
 * response the player already made rather than fetching its own.
 * See specs/architecture.md, "Why manifests are observed, not polled".
 */
export class PlaylistLoaderBase implements Loader<PlaylistLoaderContext> {
  #defaultLoader: Loader<LoaderContext>;
  #core: Core;
  context: PlaylistLoaderContext;
  stats: LoaderStats;

  constructor(config: HlsConfig, core: Core) {
    this.#defaultLoader = new config.loader(config);
    this.#core = core;
    this.stats = this.#defaultLoader.stats;
    this.context = this.#defaultLoader.context as PlaylistLoaderContext;
  }

  load(
    context: LoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>,
  ) {
    const core = this.#core;
    this.#defaultLoader.load(context, config, {
      ...callbacks,
      onSuccess(response, stats, loaderContext, networkDetails) {
        if (typeof response.data === "string") {
          core.processManifest({
            // The response URL is post-redirect; the context URL is what
            // was asked for. Prefer the former, as hls.js itself does.
            url: response.url || loaderContext.url,
            data: response.data,
          });
        }
        callbacks.onSuccess(response, stats, loaderContext, networkDetails);
      },
    });
  }

  abort() {
    this.#defaultLoader.abort();
  }

  destroy() {
    this.#defaultLoader.destroy();
  }
}
