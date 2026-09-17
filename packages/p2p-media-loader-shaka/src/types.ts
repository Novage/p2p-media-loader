import type shaka from "shaka-player/dist/shaka-player.compiled.d.ts";
import type { Core, ProcessedManifest } from "p2p-media-loader-core";

export type Shaka = typeof shaka;

export type P2PMLShakaData = {
  core: Core;
  shaka: Shaka;
  /** Called with what the core read from each manifest, before Shaka parses it. */
  onManifestProcessed: (manifest: ProcessedManifest) => void;
};

export type HookedRequest = shaka.extern.Request & {
  p2pml?: P2PMLShakaData;
};
