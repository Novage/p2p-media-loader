import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import Hls from "hls.js";

const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);
declare global {
  interface Window {
    shaka?: unknown;
    Hls?: typeof HlsWithP2P;
    LevelSelector: unknown;
    DashShakaPlayback: unknown;
  }
}

export {};
