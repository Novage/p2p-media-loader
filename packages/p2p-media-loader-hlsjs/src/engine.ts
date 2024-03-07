import type Hls from "hls.js";
import type {
  AudioTrackLoadedData,
  LevelUpdatedData,
  ManifestLoadedData,
  LevelSwitchingData,
  PlaylistLevelType,
} from "hls.js";
import type { HlsConfig, Events } from "hls.js";
import { FragmentLoaderBase } from "./fragment-loader";
import { PlaylistLoaderBase } from "./playlist-loader";
import { SegmentManager } from "./segment-mananger";
import { Config, Core, CoreEventMap, Settings } from "p2p-media-loader-core";

export class Engine {
  private readonly core: Core;
  private readonly segmentManager: SegmentManager;
  private hlsInstanceGetter?: () => Hls;
  private currentHlsInstance?: Hls;

  constructor(config: Config) {
    this.core = new Core(config);
    this.segmentManager = new SegmentManager(this.core);
  }

  public addEventListener<K extends keyof CoreEventMap>(
    eventName: K,
    listener: CoreEventMap[K],
  ) {
    this.core.addEventListener(eventName, listener);
  }

  public removeEventListener<K extends keyof CoreEventMap>(
    eventName: K,
    listener: CoreEventMap[K],
  ) {
    this.core.removeEventListener(eventName, listener);
  }

  public getConfig(): Partial<HlsConfig> {
    return {
      fLoader: this.createFragmentLoaderClass(),
      pLoader: this.createPlaylistLoaderClass(),
    };
  }

  public applyConfig(
    values: Partial<
      Pick<
        Settings,
        | "httpDownloadTimeWindow"
        | "p2pDownloadTimeWindow"
        | "p2pNotReceivingBytesTimeoutMs"
        | "httpNotReceivingBytesTimeoutMs"
      >
    >,
  ) {
    this.core.applyConfig(values);
  }

  setHls(hls: Hls | (() => Hls)) {
    this.hlsInstanceGetter = typeof hls === "function" ? hls : () => hls;
  }

  private initHlsEvents() {
    const hlsInstance = this.hlsInstanceGetter?.();
    if (this.currentHlsInstance === hlsInstance) return;
    if (this.currentHlsInstance) this.destroy();
    this.currentHlsInstance = hlsInstance;
    this.updateHlsEventsHandlers("register");
    this.updateMediaElementEventHandlers("register");
  }

  private updateHlsEventsHandlers(type: "register" | "unregister") {
    const hls = this.currentHlsInstance;
    if (!hls) return;
    const method = type === "register" ? "on" : "off";

    hls[method](
      "hlsManifestLoaded" as Events.MANIFEST_LOADED,
      this.handleManifestLoaded,
    );
    hls[method](
      "hlsLevelSwitching" as Events.LEVEL_SWITCHING,
      this.handleLevelSwitching,
    );
    hls[method](
      "hlsLevelUpdated" as Events.LEVEL_UPDATED,
      this.handleLevelUpdated,
    );
    hls[method](
      "hlsAudioTrackLoaded" as Events.AUDIO_TRACK_LOADED,
      this.handleLevelUpdated,
    );
    hls[method]("hlsDestroying" as Events.DESTROYING, this.destroy);
    hls[method](
      "hlsMediaAttaching" as Events.MEDIA_ATTACHING,
      this.destroyCore,
    );
    hls[method](
      "hlsManifestLoading" as Events.MANIFEST_LOADING,
      this.destroyCore,
    );
    hls[method](
      "hlsMediaDetached" as Events.MEDIA_DETACHED,
      this.handleMediaDetached,
    );
    hls[method](
      "hlsMediaAttached" as Events.MEDIA_ATTACHED,
      this.handleMediaAttached,
    );
  }

  private updateMediaElementEventHandlers = (
    type: "register" | "unregister",
  ) => {
    const media = this.currentHlsInstance?.media;
    if (!media) return;
    const method =
      type === "register" ? "addEventListener" : "removeEventListener";
    media[method]("timeupdate", this.handlePlaybackUpdate);
    media[method]("seeking", this.handlePlaybackUpdate);
    media[method]("ratechange", this.handlePlaybackUpdate);
  };

  private handleManifestLoaded = (event: string, data: ManifestLoadedData) => {
    const networkDetails: unknown = data.networkDetails;
    if (networkDetails instanceof XMLHttpRequest) {
      this.core.setManifestResponseUrl(networkDetails.responseURL);
    } else if (networkDetails instanceof Response) {
      this.core.setManifestResponseUrl(networkDetails.url);
    }
    this.segmentManager.processMasterManifest(data);
  };

  private handleLevelSwitching = (event: string, data: LevelSwitchingData) => {
    if (data.bitrate) this.core.setActiveLevelBitrate(data.bitrate);
  };

  private handleLevelUpdated = (
    event: string,
    data: LevelUpdatedData | AudioTrackLoadedData,
  ) => {
    if (
      this.currentHlsInstance &&
      data.details.live &&
      data.details.fragments[0].type === ("main" as PlaylistLevelType) &&
      !this.currentHlsInstance.userConfig.liveSyncDuration &&
      !this.currentHlsInstance.userConfig.liveSyncDurationCount &&
      data.details.fragments.length > 4
    ) {
      this.currentHlsInstance.config.liveSyncDurationCount =
        data.details.fragments.length - 1;
    }

    this.core.setIsLive(data.details.live);
    this.segmentManager.updatePlaylist(data);
  };

  private handleMediaAttached = () => {
    this.updateMediaElementEventHandlers("register");
  };

  private handleMediaDetached = () => {
    this.updateMediaElementEventHandlers("unregister");
  };

  private handlePlaybackUpdate = (event: Event) => {
    const media = event.target as HTMLMediaElement;
    this.core.updatePlayback(media.currentTime, media.playbackRate);
  };

  private destroyCore = () => this.core.destroy();

  initClapprPlayer(clapprPlayer: unknown) {
    // eslint-disable-next-line
    this.setHls(() => (clapprPlayer as any).core.getCurrentPlayback()?._hls);
  }

  destroy = () => {
    this.destroyCore();
    this.updateHlsEventsHandlers("unregister");
    this.updateMediaElementEventHandlers("unregister");
    this.currentHlsInstance = undefined;
  };

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
      constructor(config: HlsConfig) {
        super(config);
        engine.initHlsEvents();
      }
    };
  }
}
