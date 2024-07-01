import type Hls from "hls.js";
import type {
  AudioTrackLoadedData,
  LevelUpdatedData,
  ManifestLoadedData,
  LevelSwitchingData,
  PlaylistLevelType,
} from "hls.js";
import type { HlsConfig, Events } from "hls.js";
import { FragmentLoaderBase } from "./fragment-loader.js";
import { PlaylistLoaderBase } from "./playlist-loader.js";
import { SegmentManager } from "./segment-mananger.js";
import {
  CoreConfig,
  Core,
  CoreEventMap,
  DynamicCoreConfig,
  debug,
} from "p2p-media-loader-core";
import { injectMixin } from "./engine-static.js";

/** Represents the complete configuration for HlsJsP2PEngine. */
export type HlsJsP2PEngineConfig = {
  /** Core config */
  core: CoreConfig;
};

/** Allows for partial configuration of HlsJsP2PEngine, useful for providing overrides or partial updates. */
export type PartialHlsJsP2PEngineConfig = Partial<
  Omit<HlsJsP2PEngineConfig, "core">
> & {
  /** Partial core config */
  core?: Partial<CoreConfig>;
};

/** Type for specifying dynamic configuration options that can be changed at runtime for the P2P engine's core. */
export type DynamicHlsJsP2PEngineConfig = {
  /** Dynamic core config */
  core?: DynamicCoreConfig;
};

/**
 * Extends a generic HLS type to include the P2P engine, integrating P2P capabilities directly into the HLS instance.
 * @template HlsType The base HLS type that is being extended.
 */
export type HlsWithP2PInstance<HlsType> = HlsType & {
  /** HlsJsP2PEngine instance */
  readonly p2pEngine: HlsJsP2PEngine;
};

/**
 * Configuration type for HLS instances that includes P2P settings, augmenting standard HLS configuration with P2P capabilities.
 * @template HlsType A constructor type that produces an HLS instance.
 */
export type HlsWithP2PConfig<HlsType extends abstract new () => unknown> =
  ConstructorParameters<HlsType>[0] & {
    p2p?: PartialHlsJsP2PEngineConfig & {
      onHlsJsCreated?: (hls: HlsWithP2PInstance<HlsType>) => void;
    };
  };

/**
 * Represents a P2P (peer-to-peer) engine for HLS (HTTP Live Streaming) to enhance media streaming efficiency.
 * This class integrates P2P technologies into HLS.js, enabling the distribution of media segments via a peer network
 * alongside traditional HTTP fetching. It reduces server bandwidth costs and improves scalability by sharing the load
 * across multiple clients.
 *
 * The engine manages core functionalities such as segment fetching, segment management, peer connection management,
 * and event handling related to the P2P and HLS processes.
 *
 * @example
 * // Creating an instance of HlsJsP2PEngine with custom configuration
 * const hlsP2PEngine = new HlsJsP2PEngine({
 *   core: {
 *     highDemandTimeWindow: 30, // 30 seconds
 *     simultaneousHttpDownloads: 3,
 *     webRtcMaxMessageSize: 64 * 1024, // 64 KB
 *     p2pNotReceivingBytesTimeoutMs: 10000, // 10 seconds
 *     p2pInactiveLoaderDestroyTimeoutMs: 15000, // 15 seconds
 *     httpNotReceivingBytesTimeoutMs: 8000, // 8 seconds
 *     httpErrorRetries: 2,
 *     p2pErrorRetries: 2,
 *     announceTrackers: ["wss://personal.tracker.com"],
 *     rtcConfig: {
 *       iceServers: [{ urls: "stun:personal.stun.com" }]
 *     },
 *     swarmId: "example-swarm-id"
 *   }
 * });
 *
 */
export class HlsJsP2PEngine {
  private readonly core: Core;
  private readonly segmentManager: SegmentManager;
  private hlsInstanceGetter?: () => Hls;
  private currentHlsInstance?: Hls;
  private readonly debug = debug("p2pml-hlsjs:engine");

  /**
   * Enhances a given Hls.js class by injecting additional P2P (peer-to-peer) functionalities.
   *
   * @returns {HlsWithP2PInstance} - The enhanced Hls.js class with P2P functionalities.
   *
   * @example
   * const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);
   *
   * const hls = new HlsWithP2P({
   *   // Hls.js configuration
   *   startLevel: 0, // Example of Hls.js config parameter
   *   p2p: {
   *     core: {
   *       // P2P core configuration
   *     },
   *     onHlsJsCreated(hls) {
   *       // Do something with the Hls.js instance
   *     },
   *   },
   * });
   */
  static injectMixin(hls: typeof Hls) {
    return injectMixin(hls);
  }

  /**
   * Constructs an instance of HlsJsP2PEngine.
   * @param config Optional configuration for P2P engine setup.
   */
  constructor(config?: PartialHlsJsP2PEngineConfig) {
    this.core = new Core(config?.core);
    this.segmentManager = new SegmentManager(this.core);
  }

  /**
   * Adds an event listener for the specified event.
   * @param eventName The name of the event to listen for.
   * @param listener The callback function to be invoked when the event is triggered.
   *
   * @example
   * // Listening for a segment being successfully loaded
   * p2pEngine.addEventListener('onSegmentLoaded', (details) => {
   *   console.log('Segment Loaded:', details);
   * });
   *
   * @example
   * // Handling segment load errors
   * p2pEngine.addEventListener('onSegmentError', (errorDetails) => {
   *   console.error('Error loading segment:', errorDetails);
   * });
   *
   * @example
   * // Tracking data downloaded from peers
   * p2pEngine.addEventListener('onChunkDownloaded', (bytesLength, downloadSource, peerId) => {
   *   console.log(`Downloaded ${bytesLength} bytes from ${downloadSource} ${peerId ? 'from peer ' + peerId : 'from server'}`);
   * });
   */
  addEventListener<K extends keyof CoreEventMap>(
    eventName: K,
    listener: CoreEventMap[K],
  ) {
    this.core.addEventListener(eventName, listener);
  }

  /**
   * Removes an event listener for the specified event.
   * @param eventName The name of the event.
   * @param listener The callback function that was previously added.
   */
  removeEventListener<K extends keyof CoreEventMap>(
    eventName: K,
    listener: CoreEventMap[K],
  ) {
    this.core.removeEventListener(eventName, listener);
  }

  /**
   * provides the Hls.js P2P specific configuration for Hls.js loaders.
   * @returns An object with fragment loader (fLoader) and playlist loader (pLoader).
   */
  getConfigForHlsJs<F = unknown, P = unknown>(): { fLoader: F; pLoader: P } {
    return {
      fLoader: this.createFragmentLoaderClass() as F,
      pLoader: this.createPlaylistLoaderClass() as P,
    };
  }

  /**
   * Returns the configuration of the HLS.js P2P engine.
   * @returns A readonly version of the HlsJsP2PEngineConfig.
   */
  getConfig(): HlsJsP2PEngineConfig {
    return { core: this.core.getConfig() };
  }

  /**
   * Applies dynamic configuration updates to the P2P engine.
   * @param dynamicConfig Configuration changes to apply.
   *
   * @example
   * // Assuming `hlsP2PEngine` is an instance of HlsJsP2PEngine
   *
   * const newDynamicConfig = {
   *   core: {
   *     // Increase the number of cached segments to 1000
   *     cachedSegmentsCount: 1000,
   *     // 50 minutes of segments will be downloaded further through HTTP connections if P2P fails
   *     httpDownloadTimeWindow: 3000,
   *     // 100 minutes of segments will be downloaded further through P2P connections
   *     p2pDownloadTimeWindow: 6000,
   * };
   *
   * hlsP2PEngine.applyDynamicConfig(newDynamicConfig);
   */
  applyDynamicConfig(dynamicConfig: DynamicHlsJsP2PEngineConfig) {
    if (dynamicConfig.core) this.core.applyDynamicConfig(dynamicConfig.core);
  }

  /**
   * Sets the HLS instance for handling media.
   * @param hls The HLS instance or a function that returns an HLS instance.
   */
  bindHls<T = unknown>(hls: T | (() => T)) {
    this.hlsInstanceGetter =
      typeof hls === "function" ? (hls as () => Hls) : () => hls as Hls;
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
    this.segmentManager.processMainManifest(data);
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
      this.currentHlsInstance.config.liveSyncDurationCount !==
        data.details.fragments.length - 1 &&
      data.details.live &&
      data.details.fragments[0].type === ("main" as PlaylistLevelType) &&
      !this.currentHlsInstance.userConfig.liveSyncDuration &&
      !this.currentHlsInstance.userConfig.liveSyncDurationCount &&
      data.details.fragments.length > 4
    ) {
      this.debug(
        `set liveSyncDurationCount ${data.details.fragments.length - 1}`,
      );
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

  /** Clean up and release all resources. Unregister all event handlers. */
  destroy = () => {
    this.destroyCore();
    this.updateHlsEventsHandlers("unregister");
    this.updateMediaElementEventHandlers("unregister");
    this.currentHlsInstance = undefined;
  };

  private createFragmentLoaderClass() {
    const core = this.core;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const engine = this;

    return class FragmentLoader extends FragmentLoaderBase {
      constructor(config: HlsConfig) {
        super(config, core);
      }

      static getEngine() {
        return engine;
      }
    };
  }

  private createPlaylistLoaderClass() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const engine = this;
    return class PlaylistLoader extends PlaylistLoaderBase {
      constructor(config: HlsConfig) {
        super(config);
        engine.initHlsEvents();
      }
    };
  }
}
