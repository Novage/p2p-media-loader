import type shaka from "shaka-player/dist/shaka-player.compiled.d.ts";
import type { Core, ProcessedManifest } from "p2p-media-loader-core";

export type Shaka = typeof shaka;

export type P2PMLShakaData = {
  core: Core;
  shaka: Shaka;
  /**
   * What the presentation playing now is, or `undefined` once the engine has
   * let the player go. A request holds on to this when it is made and asks
   * again when it settles: a manifest of the source before it — another
   * source on this player, or another player entirely — would otherwise be
   * read into a core now serving a different presentation, registering
   * streams nothing plays and, if it beats that presentation's own first
   * manifest, naming the swarm after a stream this player never asked for.
   */
  currentSource: () => object | undefined;
  /**
   * Called with how the core sees the presentation, each time it reads
   * something that describes it: a manifest, before Shaka parses the same
   * bytes, and a stream's external segment index, which Shaka requests from
   * the middle of its own parse. What is configured from the latter reaches
   * the next load rather than the one that fetched it.
   */
  onManifestProcessed: (manifest: ProcessedManifest) => void;
};

export type HookedRequest = shaka.extern.Request & {
  p2pml?: P2PMLShakaData;
};
