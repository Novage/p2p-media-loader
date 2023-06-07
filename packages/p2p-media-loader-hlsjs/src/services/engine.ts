import type { HlsConfig } from "hls.js";
import { PlaylistLoaderBase } from "./playlist-loader";
import { FragmentLoaderBase } from "./fragment-loader";
import { HybridLoader } from "p2p-media-loader-core";

export class Engine {
  hybridLoader: HybridLoader;

  constructor() {
    this.hybridLoader = new HybridLoader();
  }

  public getConfig(): Pick<HlsConfig, "pLoader" | "fLoader"> {
    return {
      pLoader: this.createPlaylistLoaderClass(),
      fLoader: this.createFragmentLoaderClass(),
    };
  }

  private createPlaylistLoaderClass() {
    const hybridLoader = this.hybridLoader;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const engine = this;

    return class PlaylistLoader extends PlaylistLoaderBase {
      constructor(config: HlsConfig) {
        super(config, hybridLoader);
      }

      static getEngine() {
        return engine;
      }
    };
  }

  private createFragmentLoaderClass() {
    const hybridLoader = this.hybridLoader;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const engine = this;

    return class FragmentLoader extends FragmentLoaderBase {
      constructor(config: HlsConfig) {
        super(config, hybridLoader);
      }

      static getEngine() {
        return engine;
      }
    };
  }
}
