import type Hls from "hls.js";
import type { HlsConfig, Events } from "hls.js";
import { PlaylistLoaderBase } from "./playlist-loader";
import { FragmentLoaderBase } from "./fragment-loader";
import { SegmentManager } from "./segment-mananger";

export class Engine {
  segmentManager: SegmentManager;

  constructor() {
    this.segmentManager = new SegmentManager();
  }

  public getConfig(): Pick<HlsConfig, "pLoader" | "fLoader"> {
    return {
      pLoader: this.createPlaylistLoaderClass(),
      fLoader: this.createFragmentLoaderClass(),
    };
  }

  public initHlsEvents(hls: Hls) {
    hls.on("hlsManifestLoading" as Events.MANIFEST_LOADING, (event) => {
      console.log(event);
      console.log(this.segmentManager);
    });
    hls.on("hlsDestroying" as Events.DESTROYING, (event) => {
      console.log(event);
      this.segmentManager = new SegmentManager();
    });
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
