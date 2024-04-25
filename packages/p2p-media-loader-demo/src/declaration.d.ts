import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import Hls from "hls.js";

const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);
declare global {
  interface Window {
    shaka?: shaka;
    Hls?: typeof HlsWithP2P;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Clappr: any;
    LevelSelector: unknown;
    DashShakaPlayback: unknown;
  }
}

export {};
