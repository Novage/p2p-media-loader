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
import { isSecondaryPlayer } from "./secondary-player.js";

/**
 * The playlists that name streams and segments: the master, a variant's media
 * playlist, and an audio rendition's. A subtitle track's names neither, and
 * the core would ignore it — the master told it which playlists carry no
 * video or audio — so this only spares a parse. The whitelist is the
 * adapter's ordinary one, of the request types it handles; see
 * specs/player-adapters.md.
 */
const PLAYLISTS_THE_CORE_READS = new Set<string>([
  "manifest",
  "level",
  "audioTrack",
]);

/**
 * Wraps HLS.js's own playlist loader so the manifests that describe this
 * presentation are also handed to the core: the master, a variant's media
 * playlist and an audio rendition's, fetched by the primary player. A
 * subtitle track's playlist, and anything a player HLS.js built beside the
 * primary fetches, pass through untouched — see `load` for both.
 *
 * Loading itself is untouched either way: the core observes the response the
 * player already made rather than fetching its own. See
 * specs/architecture.md, "Why manifests are observed, not polled".
 */
export class PlaylistLoaderBase implements Loader<PlaylistLoaderContext> {
  #defaultLoader: Loader<LoaderContext>;
  #core: Core;
  readonly #ofAnotherPlayer: boolean;

  constructor(config: HlsConfig, core: Core) {
    this.#defaultLoader = new config.loader(config);
    this.#core = core;
    this.#ofAnotherPlayer = isSecondaryPlayer(config);
  }

  /**
   * Read through to the loader doing the work rather than copied from it.
   * HLS.js reads the context back off its playlist loaders — to tell a
   * request already in flight from a new one, and to abort the loader of a
   * level it has dropped — and `load` assigns a fresh one each time, so a
   * copy taken at construction is `null` for the life of this object.
   */
  get context(): PlaylistLoaderContext | null {
    return this.#defaultLoader.context as PlaylistLoaderContext | null;
  }

  set context(value: PlaylistLoaderContext | null) {
    this.#defaultLoader.context = value;
  }

  get stats(): LoaderStats {
    return this.#defaultLoader.stats;
  }

  set stats(value: LoaderStats) {
    this.#defaultLoader.stats = value;
  }

  load(
    context: LoaderContext,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>,
  ) {
    const core = this.#core;
    // Subtitle tracks come through here too; see PLAYLISTS_THE_CORE_READS.
    const parsed =
      !this.#ofAnotherPlayer &&
      PLAYLISTS_THE_CORE_READS.has((context as PlaylistLoaderContext).type);
    this.#defaultLoader.load(context, config, {
      ...callbacks,
      onSuccess(response, stats, loaderContext, networkDetails) {
        if (parsed && typeof response.data === "string") {
          core.processManifest({
            // The response URL is post-redirect, and URIs resolve against it,
            // as HLS.js itself does. What was asked for goes along with it:
            // that is the name the master gave this playlist.
            url: response.url || loaderContext.url,
            requestedUrl: loaderContext.url,
            data: response.data,
          });
        }
        callbacks.onSuccess(response, stats, loaderContext, networkDetails);
      },
    });
  }

  /**
   * HLS.js reads this off the loader it was handed, not off the one doing the
   * work: it is how a live playlist learns how long a CDN held it. Left
   * unanswered, HLS.js pins `ageHeader` to 0, and a blocking reload loses the
   * cached-age term that carries it past what the CDN already has.
   */
  getCacheAge(): number | null {
    return this.#defaultLoader.getCacheAge?.() ?? null;
  }

  abort() {
    this.#defaultLoader.abort();
  }

  destroy() {
    this.#defaultLoader.destroy();
  }
}
