import {
  HlsConfig,
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  LoaderStats,
  PlaylistLoaderContext,
} from "hls.js";
import { Core, type ProcessedManifest } from "p2p-media-loader-core";
import { isSecondaryPlayer } from "./secondary-player.js";

/**
 * The playlists the core reads: the master, a variant's media playlist, an
 * audio rendition's, and a subtitle track's. The last registers no stream —
 * the master told the core which playlists carry no video or audio — but
 * names the fragments HLS.js then asks for, which the core recognises rather
 * than counting each a registry miss. The whitelist is the adapter's
 * ordinary one, of the request types it handles; see
 * specs/player-adapters.md.
 */
const PLAYLISTS_THE_CORE_READS = new Set<string>([
  "manifest",
  "level",
  "audioTrack",
  "subtitleTrack",
]);

/**
 * The playlists that describe the main level: a variant's media playlist,
 * and a media playlist loaded as the manifest itself. An audio or subtitle
 * rendition's would describe the same window, and must not place the player.
 */
const MAIN_PLAYLISTS = new Set<string>(["manifest", "level"]);

/**
 * Told what the core made of a main playlist, before HLS.js reads it. See
 * `HlsJsP2PEngine`'s live placement.
 */
export type OnMainPlaylistProcessed = (manifest: ProcessedManifest) => void;

/**
 * Wraps HLS.js's own playlist loader so the manifests that describe this
 * presentation are also handed to the core: the master and every media
 * playlist, fetched by the primary player. What a player HLS.js built beside
 * the primary fetches passes through untouched — see `load`.
 *
 * Loading itself is untouched either way: the core observes the response the
 * player already made rather than fetching its own. See
 * specs/architecture.md, "Why manifests are observed, not polled".
 */
export class PlaylistLoaderBase implements Loader<PlaylistLoaderContext> {
  #defaultLoader: Loader<LoaderContext>;
  #core: Core;
  readonly #ofAnotherPlayer: boolean;
  readonly #onMainPlaylistProcessed?: OnMainPlaylistProcessed;

  constructor(
    config: HlsConfig,
    core: Core,
    onMainPlaylistProcessed?: OnMainPlaylistProcessed,
  ) {
    this.#defaultLoader = new config.loader(config);
    this.#core = core;
    this.#ofAnotherPlayer = isSecondaryPlayer(config);
    this.#onMainPlaylistProcessed = onMainPlaylistProcessed;
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
    const onMainPlaylistProcessed = this.#onMainPlaylistProcessed;
    const { type } = context as PlaylistLoaderContext;
    const parsed = !this.#ofAnotherPlayer && PLAYLISTS_THE_CORE_READS.has(type);
    this.#defaultLoader.load(context, config, {
      ...callbacks,
      onSuccess(response, stats, loaderContext, networkDetails) {
        if (parsed && typeof response.data === "string") {
          const processed = core.processManifest({
            // The response URL is post-redirect, and URIs resolve against it,
            // as HLS.js itself does. What was asked for goes along with it:
            // that is the name the master gave this playlist.
            url: response.url || loaderContext.url,
            requestedUrl: loaderContext.url,
            data: response.data,
          });
          // Before HLS.js reads the playlist: the start it picks from it is
          // where the player begins, and some versions keep it.
          if (processed && MAIN_PLAYLISTS.has(type)) {
            onMainPlaylistProcessed?.(processed);
          }
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
