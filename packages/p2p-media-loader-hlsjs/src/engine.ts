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
import {
  CoreConfig,
  Core,
  CoreEventMap,
  DynamicCoreConfig,
  debug,
} from "p2p-media-loader-core";
import { DeepReadonly } from "ts-essentials";
import { injectMixin } from "./engine-static";

/**
 * Represents the complete configuration for HlsJsP2PEngine.
 */
export type HlsJsP2PEngineConfig = {
  core: CoreConfig;
};

/**
 * Allows for partial configuration of HlsJsP2PEngine, useful for providing overrides or partial updates.
 */
export type PartialHlsJsP2PEngineConfig = Partial<
  Omit<HlsJsP2PEngineConfig, "core">
> & {
  core?: Partial<CoreConfig>;
};

/**
 * Type for specifying dynamic configuration options that can be changed at runtime for the P2P engine's core.
 */
export type DynamicHlsJsP2PEngineConfig = {
  core?: DynamicCoreConfig;
};

/**
 * Extends a generic HLS type to include the P2P engine, integrating P2P capabilities directly into the HLS instance.
 * @template HlsType The base HLS type that is being extended.
 */
export type HlsWithP2PInstance<HlsType> = HlsType & {
  readonly p2pEngine: HlsJsP2PEngine;
};

/**
 * Configuration type for HLS instances that includes P2P settings, augmenting standard HLS configuration with P2P capabilities.
 * @template HlsType A constructor type that produces an HLS instance.
 */
export type HlsWithP2PConfig<HlsType extends abstract new () => unknown> =
  ConstructorParameters<HlsType>[0] & {
    p2p?: DeepReadonly<PartialHlsJsP2PEngineConfig> & {
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
 *     highDemandTimeWindow: 30000, // 30 seconds
 *     simultaneousHttpDownloads: 3,
 *     cachedSegmentsCount: 50,
 *     webRtcMaxMessageSize: 262144, // 256 KB
 *     p2pNotReceivingBytesTimeoutMs: 10000, // 10 seconds
 *     p2pLoaderDestroyTimeoutMs: 15000, // 15 seconds
 *     httpNotReceivingBytesTimeoutMs: 8000, // 8 seconds
 *     httpErrorRetries: 2,
 *     p2pErrorRetries: 2,
 *     announceTrackers: ["wss://tracker.example.com"],
 *     rtcConfig: {
 *       iceServers: [{ urls: "stun:stun.example.com" }]
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

  /** Static method to inject mixins for extending functionality */
  static injectMixin = injectMixin;

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
   * // Detecting when a peer connects, useful for monitoring the health of the P2P network
   * p2pEngine.addEventListener('onPeerConnect', (peerId) => {
   *   console.log('Peer connected:', peerId);
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
   * Retrieves the HLS.js specific configuration for loaders.
   * @returns An object with fragment loader (fLoader) and playlist loader (pLoader).
   */
  getHlsJsConfig<F = unknown, P = unknown>(): { fLoader: F; pLoader: P } {
    return {
      fLoader: this.createFragmentLoaderClass() as F,
      pLoader: this.createPlaylistLoaderClass() as P,
    };
  }

  /**
   * Returns the configuration of the HLS.js P2P engine.
   * @returns A readonly version of the HlsJsP2PEngineConfig.
   */
  getConfig(): DeepReadonly<HlsJsP2PEngineConfig> {
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
   *     p2pNotReceivingBytesTimeoutMs: 20000, // Adjusting timeout to 20 seconds
   *     httpDownloadTimeWindow: 15000, // Extending HTTP download time window to 15 seconds
   *   }
   * };
   *
   * hlsP2PEngine.applyDynamicConfig(newDynamicConfig);
   */
  applyDynamicConfig(dynamicConfig: DeepReadonly<DynamicHlsJsP2PEngineConfig>) {
    if (dynamicConfig.core) this.core.applyDynamicConfig(dynamicConfig.core);
  }

  /**
   * Sets the HLS instance for handling media.
   * @param hls The HLS instance or a function that returns an HLS instance.
   */
  setHls<T = unknown>(hls: T | (() => T)) {
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

  /**
   * Initialize Clappr player integration with HLS.js.
   * @param clapprPlayer The Clappr player instance to integrate with.
   */
  initClapprPlayer(clapprPlayer: unknown) {
    // eslint-disable-next-line
    this.setHls(() => (clapprPlayer as any).core.getCurrentPlayback()?._hls);
  }

  /**
   * Clean up and release all resources. Unregisters all event handlers.
   */
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
