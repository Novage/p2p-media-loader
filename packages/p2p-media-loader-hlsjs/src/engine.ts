import type Hls from "hls.js";
import type {
  LevelDetails,
  LevelUpdatedData,
  PlaylistLevelType,
  HlsConfig,
  Events,
} from "hls.js";
import { FragmentLoaderBase } from "./fragment-loader.js";
import { PlaylistLoaderBase } from "./playlist-loader.js";
import {
  CoreConfig,
  Core,
  CoreEventMap,
  DynamicCoreConfig,
  debug,
  DefinedCoreConfig,
  liveDelayFromWindow,
  trackMediaElementPlayback,
} from "p2p-media-loader-core";
import { injectMixin } from "./engine-static.js";
import { hlsManifestParser } from "p2p-media-loader-core/hls";

/** Represents the complete configuration for the `HlsJsP2PEngine`. */
export type HlsJsP2PEngineConfig = {
  /** Complete core configuration settings. */
  core: DefinedCoreConfig;
};

/** Allows for partial configuration of the `HlsJsP2PEngine`, useful for providing overrides or partial updates. */
export type PartialHlsJsP2PEngineConfig = {
  /** Partial core config */
  core?: Partial<CoreConfig>;
};

/** A type for specifying dynamic configuration options that can be changed at runtime for the P2P engine's core. */
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
 * Where the player sits in a live window. See specs/player-adapters.md,
 * "HLS.js".
 *
 * Every segment between the player's buffer and the live edge is one peers
 * can fetch for each other, so the player is placed as deep in the window as
 * it can go. Where exactly is the core's `liveDelayFromWindow` to say, the
 * same answer every adapter gets. Its own forward buffer keeps the fetch
 * positions inside the window even as the playhead drifts past the tail.
 */

/**
 * How far beyond the target the re-sync threshold sits, so a viewer who pauses
 * or stalls is brought back to the target before the buffer starves.
 */
const LIVE_RESYNC_MARGIN_SEGMENTS = 2;

/**
 * Represents a Peer-to-Peer (P2P) engine for HLS (HTTP Live Streaming) to enhance media streaming efficiency.
 * This class integrates P2P technologies into HLS.js, enabling the distribution of media segments via a peer network
 * alongside traditional HTTP fetching. This reduces server bandwidth costs and improves scalability by sharing the load
 * across multiple clients.
 *
 * The engine has three responsibilities (see specs/player-adapters.md): it
 * hands the playlists that describe this presentation to the core, routes
 * fragment requests through the core, and reports playback state from the
 * media element. The core parses the playlists itself; nothing here describes
 * streams to it.
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
  private hlsInstanceGetter?: () => Hls | undefined;
  private currentHlsInstance?: Hls;
  private readonly playback = trackMediaElementPlayback((state, media) => {
    if (this.oracle.enabled) {
      this.oracle(`media.currentTime=${media.currentTime.toFixed(3)}`);
    }
    this.core.updatePlayback(state);
  });
  private readonly debug = debug("p2pml-hlsjs:engine");
  // See HybridLoader.oracleLogger: logs media.currentTime beside the core's
  // estimate so the two can be compared while the playback contract beds in.
  private readonly oracle = debug("p2pml:playback-oracle");

  /**
   * Enhances a given HLS.js class by injecting additional Peer-to-Peer (P2P) functionalities.
   *
   * @returns The enhanced HLS.js class with P2P functionalities.
   *
   * @example
   * const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);
   *
   * const hls = new HlsWithP2P({
   *   // HLS.js configuration
   *   startLevel: 0, // Example of HLS.js config parameter
   *   p2p: {
   *     core: {
   *       // P2P core configuration
   *     },
   *     onHlsJsCreated(hls) {
   *       // Do something with the HLS.js instance
   *     },
   *   },
   * });
   */
  static injectMixin(hls: typeof Hls) {
    return injectMixin(hls);
  }

  /**
   * Constructs an instance of `HlsJsP2PEngine`.
   * @param config An optional configuration for the P2P engine setup.
   */
  constructor(config?: PartialHlsJsP2PEngineConfig) {
    this.core = new Core({
      ...config?.core,
      // HLS.js plays HLS only; a bundle of this engine carries no DASH parser.
      manifestParsers: config?.core?.manifestParsers ?? [hlsManifestParser],
    });
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
   * Provides the HLS.js P2P specific configuration for HLS.js loaders.
   *
   * An integration that constructs HLS.js itself should also pass
   * `lowLatencyMode: false` (the mixin does so unless the integrator sets it):
   * in low-latency mode HLS.js requests partial segments, which the core does
   * not register, so those requests bypass P2P.
   *
   * @returns An object containing the fragment loader (`fLoader`) and playlist loader (`pLoader`).
   */
  getConfigForHlsJs(): { fLoader: unknown; pLoader: unknown } {
    return {
      fLoader: this.createFragmentLoaderClass(),
      pLoader: this.createPlaylistLoaderClass(),
    };
  }

  /**
   * Retrieves the current configuration of the HLS.js P2P engine.
   * @returns A readonly version of the `HlsJsP2PEngineConfig`.
   */
  getConfig(): HlsJsP2PEngineConfig {
    return { core: this.core.getConfig() };
  }

  /**
   * Applies dynamic configuration updates to the P2P engine.
   * @param dynamicConfig The configuration changes to apply.
   *
   * @example
   * // Assuming `hlsP2PEngine` is an instance of HlsJsP2PEngine
   *
   * const newDynamicConfig = {
   *   core: {
   *     // Increase the number of cached segments to 1000
   *     cachedSegmentsCount: 1000,
   *     // 50 minutes of segments will be preemptively downloaded via HTTP connections
   *     httpDownloadTimeWindow: 3000,
   *     // 100 minutes of segments will be preemptively downloaded via P2P connections
   *     p2pDownloadTimeWindow: 6000,
   *   }
   * };
   *
   * hlsP2PEngine.applyDynamicConfig(newDynamicConfig);
   */
  applyDynamicConfig(dynamicConfig: DynamicHlsJsP2PEngineConfig) {
    if (dynamicConfig.core) this.core.applyDynamicConfig(dynamicConfig.core);
  }

  /**
   * Sets the HLS.js instance used for handling media, or a function that
   * returns it. The function may return nothing while the player has not
   * built one yet; the engine binds when it appears.
   *
   * The instance is not typed as this package's own `Hls`, and deliberately:
   * an application often has a second copy of HLS.js with its own types —
   * `@videojs/hlsjs-video` bundles one, and its `Hls` and ours differ by
   * whole methods — so requiring this package's type would make our
   * development dependency's version part of the integration contract.
   *
   * @param hls The HLS.js instance, or a function that returns it.
   */
  bindHls<T = unknown>(hls: T | (() => T | undefined | null)) {
    const get =
      typeof hls === "function"
        ? (hls as () => T | undefined | null)
        : () => hls;
    this.hlsInstanceGetter = () => (get() ?? undefined) as Hls | undefined;
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
      "hlsLevelUpdated" as Events.LEVEL_UPDATED,
      this.handleLevelUpdated,
    );
    hls[method]("hlsDestroying" as Events.DESTROYING, this.destroy);
    // Loading a source starts a new stream; attaching a media element does
    // not. HLS.js fetches the playlists as soon as the master is parsed,
    // whether or not an element is attached, and re-attaches one mid-playback
    // of its own accord — `recoverMediaError()` detaches and attaches to get
    // past a media error. Letting the core go there would drop the registry
    // the playlists filled, and a VOD stream never fetches them again, so
    // every fragment after it would miss and load over HTTP in silence.
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
    this.playback.watch(
      type === "register"
        ? (this.currentHlsInstance?.media ?? undefined)
        : undefined,
    );
  };

  /**
   * Buffer tuning only. Streams and segments reach the core through the
   * playlist loader; live state is derived from the playlist by the core.
   *
   * The main level's playlist is what this reads. An alternate audio track's
   * would describe the same window, and HLS.js announces one through
   * `AUDIO_TRACK_LOADED` — but every fragment it parses from such a playlist
   * carries `PlaylistLevelType.AUDIO`, so listening for it would be work that
   * the fragment type below always turns away. That test is what keeps an
   * alternate rendition's playlist from tuning the main level, and is not
   * redundant with the one on length beside it.
   */
  private handleLevelUpdated = (event: string, data: LevelUpdatedData) => {
    if (
      this.currentHlsInstance &&
      data.details.fragments.length > 4 &&
      data.details.fragments[0].type === ("main" as PlaylistLevelType)
    ) {
      if (data.details.live) this.updateLiveSync(data.details);

      const { userConfig } = this.currentHlsInstance;
      if (
        userConfig.maxBufferLength === undefined &&
        userConfig.maxMaxBufferLength === undefined
      ) {
        this.updateMaxBufferLength(data.details.targetduration);
      }
    }
  };

  /**
   * Places the player deep in the live window so that the segments between
   * its buffer and the live edge — the ones peers exchange — are as many as
   * the window allows. Applied through HLS.js's own `targetLatency` API and
   * only when the integrator has not configured the live sync settings
   * themselves. Set once per value; HLS.js then re-syncs to it on start, on a
   * stall, and when the max latency is exceeded.
   *
   * Segment length is the playlist's average: `EXT-X-TARGETDURATION` is an
   * upper bound and can be several times the real segment.
   */
  private updateLiveSync(details: LevelDetails) {
    const hls = this.currentHlsInstance;
    if (!hls) return;

    const segment = details.averagetargetduration ?? details.targetduration;
    const window = details.totalduration;
    if (!(segment > 0) || !(window > 0)) return;

    const targetLatency = liveDelayFromWindow(window, segment);
    const maxLatency = targetLatency + LIVE_RESYNC_MARGIN_SEGMENTS * segment;

    // Segment durations are not exact multiples, so the window length drifts
    // by fractions of a second between refreshes. Only a change of at least
    // half a segment means the window itself changed; anything smaller is
    // noise, and re-applying the target would reset HLS.js's stall tracking.
    const tolerance = segment / 2;
    const differs = (current: number | undefined, next: number) =>
      current === undefined || Math.abs(current - next) >= tolerance;

    const { userConfig } = hls;
    if (
      userConfig.liveSyncDuration === undefined &&
      userConfig.liveSyncDurationCount === undefined &&
      differs(hls.config.liveSyncDuration, targetLatency)
    ) {
      this.debug(`Setting targetLatency to ${targetLatency}`);
      hls.targetLatency = targetLatency;
    }

    if (
      userConfig.liveMaxLatencyDuration === undefined &&
      userConfig.liveMaxLatencyDurationCount === undefined &&
      differs(hls.config.liveMaxLatencyDuration, maxLatency)
    ) {
      this.debug(`Setting liveMaxLatencyDuration to ${maxLatency}`);
      hls.config.liveMaxLatencyDuration = maxLatency;
    }
  }

  private updateMaxBufferLength(fragmentDuration: number) {
    if (!this.currentHlsInstance) return;

    const config = this.core.getConfig();
    const highDemandTimeWindow = Math.max(
      config.mainStream.highDemandTimeWindow,
      config.secondaryStream.highDemandTimeWindow,
    );
    // HLS.js maxBufferLength dictates how many seconds AHEAD OF THE PLAYHEAD it buffers.
    // To ensure HLS.js only buffers up to the highDemandTimeWindow and lets the
    // background loader do all the advance fetching, we set p2pOptimalBufferLength
    // directly equal to highDemandTimeWindow, but with a lower bound based on fragment duration.
    const p2pOptimalBufferLength = Math.max(
      fragmentDuration * 2,
      highDemandTimeWindow,
    );

    if (
      this.currentHlsInstance.config.maxBufferLength > p2pOptimalBufferLength
    ) {
      this.debug(`Setting maxBufferLength to ${p2pOptimalBufferLength}`);
      this.currentHlsInstance.config.maxBufferLength = p2pOptimalBufferLength;
    }

    if (
      this.currentHlsInstance.config.maxMaxBufferLength > p2pOptimalBufferLength
    ) {
      this.debug(`Setting maxMaxBufferLength to ${p2pOptimalBufferLength}`);
      this.currentHlsInstance.config.maxMaxBufferLength =
        p2pOptimalBufferLength;
    }
  }

  private handleMediaAttached = () => {
    this.updateMediaElementEventHandlers("register");
  };

  private handleMediaDetached = () => {
    this.updateMediaElementEventHandlers("unregister");
  };

  private destroyCore = () => this.core.destroy();

  /** Cleans up and releases all resources, and unregisters all event handlers. */
  destroy = () => {
    this.destroyCore();
    this.updateHlsEventsHandlers("unregister");
    this.updateMediaElementEventHandlers("unregister");
    this.currentHlsInstance = undefined;
  };

  private createFragmentLoaderClass() {
    const { core } = this;
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
    const { core } = this;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const engine = this;
    return class PlaylistLoader extends PlaylistLoaderBase {
      constructor(config: HlsConfig) {
        super(config, core);
        engine.initHlsEvents();
      }
    };
  }
}
