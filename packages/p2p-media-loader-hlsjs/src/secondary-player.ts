import type { HlsConfig } from "hls.js";

/**
 * Whether this HLS.js instance is one HLS.js built beside a primary player,
 * rather than the primary itself.
 *
 * HLS.js makes a second `Hls` instance for an interstitial's ad break and for
 * trick-play I-frames, each from the primary's own config — so each carries
 * this adapter's loaders and the core behind them, and nothing either loads
 * reaches the engine's event handlers. What they load is not the presentation
 * the core holds: an ad's playlists, or an I-frame rendition no master
 * declared. Left alone they settle into the primary's registry, one stream per
 * break or rendition, and are announced in the primary's swarm under the
 * identity of nothing.
 *
 * `primarySessionId` is what HLS.js puts on both and on no primary; the
 * interstitial player also carries `assetPlayerId`, and the I-frame player
 * does not, so that one alone would miss it.
 */
export function isSecondaryPlayer(config: HlsConfig): boolean {
  return config.primarySessionId !== undefined;
}
