import type Hls from "hls.js";
import type { HlsConfig, Events, MediaPlaylist, LevelParsed } from "hls.js";
import { FragmentLoaderBase } from "./fragment-loader";
import { SegmentManager } from "./segment-mananger";
import { PlaylistLoaderBase } from "./playlist-loader";

export class Engine {
  segmentManager: SegmentManager;
  audioPlaylistMap: Map<string, MediaPlaylist> = new Map();
  videoLevels: LevelParsed[] = [];

  constructor() {
    this.segmentManager = new SegmentManager();
  }

  public getConfig(): Pick<HlsConfig, "fLoader" | "pLoader"> {
    return {
      fLoader: this.createFragmentLoaderClass(),
      pLoader: this.createPlaylistLoaderClass(),
    };
  }

  public initHlsJsEvents(hls: Hls) {
    hls.on("hlsManifestLoaded" as Events.MANIFEST_LOADED, (event, data) => {
      console.log(
        "MANIFEST_LOADED",
        data
        // data.levels.map((i) => i.)
      );

      this.videoLevels = data.levels;
      data.audioTracks.forEach((a) => {
        this.audioPlaylistMap.set(a.attrs["GROUP-ID"], a);
      });
      this.segmentManager.processMasterManifest(data);
    });

    hls.on("hlsLevelUpdated" as Events.LEVEL_UPDATED, (event, data) => {
      console.log("LEVEL_UPDATED", data);
      const level = this.videoLevels[data.level];
      const audioGroup = level.attrs["AUDIO"];
      if (audioGroup) {
        const audioLevel = this.audioPlaylistMap.get(audioGroup);
        if (audioLevel) this.segmentManager.updateVideoPlaylist(audioLevel);
        console.log("AUDIO LEVEL FRAG", audioLevel?.details?.fragments.length);
      }
      this.segmentManager.updateVideoPlaylist(data);
    });

    // hls.on(
    //   "hlsAudioTracksUpdated" as Events.AUDIO_TRACKS_UPDATED,
    //   (event, data) => {
    //     console.log("AUDIO_TRACKS_UPDATED", data);
    //     // this.segmentManager.updateVideoPlaylist(data);
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

  private createPlaylistLoaderClass() {
    const segmentManager = this.segmentManager;
    const onPlaylistLoaded = this.onPlaylistLoaded.bind(this);
    return class PlaylistLoader extends PlaylistLoaderBase {
      constructor(config: HlsConfig) {
        super(config, segmentManager, onPlaylistLoaded);
      }
    };
  }

  private onPlaylistLoaded(playlistUrl: string) {
    this.segmentManager.updatePlaylistByUrl(playlistUrl);
  }
}

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
