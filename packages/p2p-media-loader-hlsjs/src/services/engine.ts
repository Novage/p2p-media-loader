import type { HlsConfig } from "hls.js";
import { PlaylistLoaderBase } from "./playlist-loader";
import { FragmentLoaderBase } from "./fragment-loader";

export type SegmentManager = object;

export class Engine {
  segmentManager: SegmentManager;

  constructor() {
    this.segmentManager = {};
  }

  public getConfig(): Pick<HlsConfig, "pLoader" | "fLoader"> {
    return {
      pLoader: this.createPlaylistLoaderClass(),
      fLoader: this.createFragmentLoaderClass(),
    };
  }

  private createPlaylistLoaderClass() {
    const segmentManager = this.segmentManager;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const engine = this;

    return class PlaylistLoader extends PlaylistLoaderBase {
      constructor(config: HlsConfig) {
        super(config, segmentManager);
      }

      static getEngine() {
        return engine;
      }
    };
  }

  private createFragmentLoaderClass() {
    const segmentManager = this.segmentManager;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const engine = this;

    return class FragmentLoader extends FragmentLoaderBase {
      constructor(config: HlsConfig) {
        super(config, segmentManager);
      }

      static getEngine() {
        return engine;
      }
    };
  }
}
