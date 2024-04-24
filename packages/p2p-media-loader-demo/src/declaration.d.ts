import Hls from "hls.js";
import { HlsWithP2PType } from "p2p-media-loader-hlsjs";
declare global {
  interface Window {
    shaka?: shaka;
    Hls: typeof HlsWithP2PType<Hls>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Clappr: any;
    LevelSelector: unknown;
    DashShakaPlayback: unknown;
  }

  namespace Clappr {
    interface PlaybackOptions {
      hlsjsConfig?: {
        [key: string]: unknown;
      };
    }
    interface PlayerOptions {
      source: string;
      parentId: string | HTMLElement;
      plugins?: Array<unknown>;
      width?: string;
      height?: string;
      playback?: PlaybackOptions;
      shakaOnBeforeLoad?: (shakaPlayerInstance: shaka.Player) => void;
    }

    type EventHandler = (event?: unknown) => void;

    interface Events {
      on(event: string, callback: EventHandler): void;
      off(event: string, callback?: EventHandler): void;
    }

    class Player implements Events {
      constructor(options: PlayerOptions);
      destroy(): void;
      on(event: string, callback: EventHandler): void;
      off(event: string, callback?: EventHandler): void;
    }
  }
}

export {};
