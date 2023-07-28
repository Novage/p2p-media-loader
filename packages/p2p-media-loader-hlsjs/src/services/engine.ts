import type Hls from "hls.js";
import type { HlsConfig, Events } from "hls.js";
import { FragmentLoaderBase } from "./fragment-loader";
import { SegmentManager } from "./segment-mananger";
import Debug from "debug";

export class Engine {
  private readonly segmentManager: SegmentManager;
  private debugDestroying = Debug("hls:destroying");

  constructor() {
    this.segmentManager = new SegmentManager();
  }

  public getConfig(): Pick<HlsConfig, "fLoader"> {
    return {
      fLoader: this.createFragmentLoaderClass(),
    };
  }

  initHlsJsEvents(hls: Hls) {
    hls.on("hlsManifestLoaded" as Events.MANIFEST_LOADED, (event, data) => {
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

    hls.on("hlsDestroying" as Events.DESTROYING, () => {
      this.debugDestroying("Hls destroying");
      this.destroy();
    });

    hls.on("hlsManifestLoading" as Events.MANIFEST_LOADING, () => {
      this.debugDestroying("Manifest loading");
      this.destroy();
    });

    hls.on("hlsMediaAttaching" as Events.MEDIA_ATTACHING, () => {
      this.debugDestroying("Media attaching");
      this.destroy();
    });
  }

  destroy() {
    this.segmentManager.destroy();
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
