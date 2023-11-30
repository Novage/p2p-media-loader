import type Hls from "hls.js";
import type { HlsConfig, Events } from "hls.js";
import { FragmentLoaderBase } from "./fragment-loader";
import { PlaylistLoaderBase } from "./playlist-loader";
import { SegmentManager } from "./segment-mananger";
import { Core, CoreEventHandlers } from "p2p-media-loader-core";
import Debug from "debug";

type EngineState = {
  isHlsJSEventsInit: boolean;
  isPlaybackEventHandlersSet: boolean;
};

type HookedConfig = HlsConfig & {
  _getHlsInstance?: () => Hls;
};

export class Engine {
  private readonly core: Core;
  private readonly segmentManager: SegmentManager;
  private debugDestroying = Debug("hls:destroying");
  private state: EngineState = {
    isHlsJSEventsInit: false,
    isPlaybackEventHandlersSet: false,
  };

  constructor(eventHandlers?: CoreEventHandlers) {
    this.core = new Core(eventHandlers);
    this.segmentManager = new SegmentManager(this.core);
  }

  public getConfig(): Pick<
    HlsConfig,
    "fLoader" | "pLoader" | "liveSyncDurationCount"
  > {
    return {
      liveSyncDurationCount: 7,
      fLoader: this.createFragmentLoaderClass(),
      pLoader: this.createPlaylistLoaderClass(),
    };
  }

  initHlsJsEvents(hls: Hls) {
    this.state.isHlsJSEventsInit = true;
    hls.on("hlsManifestLoaded" as Events.MANIFEST_LOADED, (event, data) => {
      const { networkDetails } = data;
      if (networkDetails instanceof XMLHttpRequest) {
        this.core.setManifestResponseUrl(networkDetails.responseURL);
      } else if (networkDetails instanceof Response) {
        this.core.setManifestResponseUrl(networkDetails.url);
      }
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

    hls.on("hlsMediaAttached" as Events.MEDIA_ATTACHED, (event, data) => {
      this.setPlaybackEventHandlers(data.media);
    });

    if (hls.media) this.setPlaybackEventHandlers(hls.media);
  }

  private setPlaybackEventHandlers(media: HTMLMediaElement) {
    if (this.state.isPlaybackEventHandlersSet) return;
    media.addEventListener("timeupdate", () => {
      this.core.updatePlayback(media.currentTime, media.playbackRate);
    });

    media.addEventListener("seeking", () => {
      this.core.updatePlayback(media.currentTime, media.playbackRate);
    });

    media.addEventListener("ratechange", () => {
      this.core.updatePlayback(media.currentTime, media.playbackRate);
    });
    this.state.isPlaybackEventHandlersSet = true;
  }

  destroy() {
    this.core.destroy();
  }

  private createFragmentLoaderClass() {
    const core = this.core;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const engine: Engine = this;

    return class FragmentLoader extends FragmentLoaderBase {
      constructor(config: HlsConfig) {
        super(config, core);
      }

      static getEngine(): Engine {
        return engine;
      }
    };
  }

  private createPlaylistLoaderClass() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const engine: Engine = this;
    return class PlaylistLoader extends PlaylistLoaderBase {
      constructor(config: HookedConfig) {
        super(config);
        if (
          !engine.state.isHlsJSEventsInit &&
          typeof config._getHlsInstance === "function"
        ) {
          const hlsInstance = config._getHlsInstance();
          if (hlsInstance) engine.initHlsJsEvents(hlsInstance);
        }
      }
    };
  }
}
