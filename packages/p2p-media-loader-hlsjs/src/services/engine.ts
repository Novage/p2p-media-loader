import type Hls from "hls.js";
import type { HlsConfig, Events } from "hls.js";
import { FragmentLoaderBase } from "./fragment-loader";
import { SegmentManager } from "./segment-mananger";

export class Engine {
  segmentManager: SegmentManager;

  constructor() {
    this.segmentManager = new SegmentManager();
  }

  public getConfig(): Pick<HlsConfig, "fLoader"> {
    return {
      fLoader: this.createFragmentLoaderClass(),
    };
  }

  public initHlsJsEvents(hls: Hls) {
    hls.on("hlsManifestLoaded" as Events.MANIFEST_LOADED, (event, data) => {
      console.log("MANIFEST_LOADED", data);
      this.segmentManager.processMasterManifest(data);
    });

    hls.on("hlsLevelUpdated" as Events.LEVEL_UPDATED, (event, data) => {
      this.segmentManager.updatePlaylist(data);
    });

    hls.on(
      "hlsAudioTrackLoaded" as Events.AUDIO_TRACK_LOADED,
      (event, data) => {
        this.segmentManager.updatePlaylist(data);
      }
    );
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
