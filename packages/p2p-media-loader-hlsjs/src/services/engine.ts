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
      console.log(data);
      for (const [index, track] of data.audioTracks.entries()) {
        data.audioTracks[index] = handleObjPropChange(
          track,
          "details",
          (value) => {
            this.segmentManager.updateVideoPlaylist(value);
          }
        );
      }
      this.segmentManager.processMasterManifest(data);
    });

    hls.on("hlsLevelUpdated" as Events.LEVEL_UPDATED, (event, data) => {
      console.log("VIDEO PLAYLIST UPDATED");
      console.log(data);
      this.segmentManager.updateVideoPlaylist(data);
    });

    // hls.on(
    //   "hlsAudioTracksUpdated" as Events.AUDIO_TRACKS_UPDATED,
    //   (event, data) => {
    //     data.audioTracks.forEach((track) => {
    //       console.log("TRACK_DETAILS", track.details);
    //     });
    //   }
    // );

    // hls.on(
    //   "hlsAudioTracksUpdated" as Events.AUDIO_TRACK_LOADING,
    //   (event, data) => {
    //     console.log("AUDIO PLAYLIST UPDATED");
    //     console.log(data);
    //     // console.log(data.details.url);
    //     this.segmentManager.updateVideoPlaylist(data);
    //   }
    // );
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

const handler = {
  set<T extends object, P extends keyof T>(
    target: T,
    property: P,
    value: T[P]
  ) {
    if (property === "details") {
    }
    return true;
  },
};

function handleObjPropChange<T extends object, P extends keyof T>(
  obj: T,
  property: P,
  decorator: (obj: T) => void
) {
  const handler = {
    set(target: T, prop: P, value: unknown) {
      console.log("FUCK");
      if (prop === property && target[prop] !== value) {
        decorator(target);
      }
      return Reflect.set(target, prop, value);
    },
  };

  return new Proxy(obj, handler as any);
}
