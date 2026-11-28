/**
 * `PatchLocation` names a document that describes an MPD refresh as a diff
 * against the one the player already holds (ISO/IEC 23009-1, MPD patching).
 * A player that follows it — dash.js and Shaka both do — stops fetching whole
 * MPDs, and every refresh afterwards is a patch the core cannot read: the
 * registry would freeze at the window the first MPD described while playback
 * continued on the patched one, and P2P would fade out within a window.
 *
 * So an adapter removes the element from the MPD it passes on, and the player
 * refreshes the whole manifest as it would have without it. Nothing else about
 * the presentation changes: the element is an optimization over the refresh
 * the player performs either way. See specs/player-adapters.md.
 */
const PATCH_LOCATION =
  /<(?:[A-Za-z_][\w.-]*:)?PatchLocation\b[^>]*(?:\/>|>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?PatchLocation\s*>)/g;

/**
 * The MPD without its `PatchLocation` elements, or the same string when it
 * declares none — so a caller can tell whether anything was removed by
 * identity.
 */
export function stripPatchLocation(mpd: string): string {
  if (!mpd.includes("PatchLocation")) return mpd;
  return mpd.replace(PATCH_LOCATION, "");
}
