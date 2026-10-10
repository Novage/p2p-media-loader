import type { VideoJsLike } from "./types.js";

declare global {
  interface Window {
    videojs?: VideoJsLike;
  }
}
