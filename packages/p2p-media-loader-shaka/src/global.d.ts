import type shaka from "shaka-player/dist/shaka-player.compiled.d.ts";

declare global {
  interface Window {
    shaka: typeof shaka;
  }
}
