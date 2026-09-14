import type shaka from "shaka-player/dist/shaka-player.compiled.d.ts";
import {
  Shaka,
  HookedNetworkingEngine,
  HookedRequest,
  P2PMLShakaData,
} from "./types.js";
import { Loader } from "./loading-handler.js";
import { liveDelayFor } from "./live-delay.js";
import { hlsManifestParser } from "p2p-media-loader-core/hls";
import { dashManifestParser } from "p2p-media-loader-core/dash";
import {
  CoreConfig,
  Core,
  CoreEventMap,
  DynamicCoreConfig,
  DefinedCoreConfig,
  ProcessedManifest,
  debug,
  getPlaybackStateFromMediaElement,
} from "p2p-media-loader-core";

/** A type for specifying dynamic configuration options that can be changed at runtime for the P2P engine's core. */
export type DynamicShakaP2PEngineConfig = {
  /** Dynamic core config */
  core?: DynamicCoreConfig;
};

/** Represents the complete configuration for the `ShakaP2PEngine`. */
export type ShakaP2PEngineConfig = {
  /** Complete core configuration settings. */
  core: DefinedCoreConfig;
};

/** Allows for partial configuration settings for the `ShakaP2PEngine`. */
export type PartialShakaP2PEngineConfig = {
  /** Partial core config */
  core?: Partial<CoreConfig>;
};

/**
 * Presentation delay until the first live manifest says how wide the window
 * is; from then on the delay follows the window (see live-delay.ts). Only
 * applied when the integrator left Shaka's own default in place.
 */
const INITIAL_LIVE_EDGE_DELAY = 25;
/** Shaka's default: "derive from the manifest", which places the player near the edge. */
const SHAKA_DEFAULT_PRESENTATION_DELAY = 0;

// Every event after which the buffer ahead of the playhead or the rate may
// have changed. `progress` covers buffer growth without playhead movement.
const PLAYBACK_EVENTS = [
  "timeupdate",
  "progress",
  "seeking",
  "seeked",
  "ratechange",
  "play",
  "pause",
  "waiting",
] as const;

/**
 * Represents a Peer-to-Peer (P2P) engine designed to enhance media streaming efficiency.
 * This class integrates P2P technologies into Shaka Player, enabling the distribution of media segments via a peer network
 * alongside traditional HTTP fetching. This reduces server bandwidth costs and improves scalability by sharing the load
 * across multiple clients.
 *
 * The engine has three responsibilities (see specs/player-adapters.md): it
 * hands every manifest Shaka fetches to the core, routes segment requests
 * through the core, and reports playback state from the media element. Shaka's
 * own manifest parsers run untouched; the core parses the same bytes itself.
 *
 * @example
 * // Initializing the ShakaP2PEngine with custom configuration
 * const shakaP2PEngine = new ShakaP2PEngine({
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
 */
export class ShakaP2PEngine {
  private player?: shaka.Player;
  private readonly shaka: Shaka;
  private readonly core: Core;
  private requestFilter?: shaka.extern.RequestFilter;
  /** False when the integrator configured a presentation delay themselves. */
  private managesPresentationDelay = false;
  private readonly debug = debug("p2pml-shaka:engine");
  // See HybridLoader.oracleLogger: logs media.currentTime beside the core's
  // estimate so the two can be compared while the playback contract beds in.
  private readonly oracle = debug("p2pml:playback-oracle");

  /**
   * Constructs an instance of `ShakaP2PEngine`.
   *
   * @param config An optional configuration for customizing the P2P engine's behavior.
   * @param shaka The Shaka Player library instance.
   */
  constructor(config?: PartialShakaP2PEngineConfig, shaka = window.shaka) {
    validateShaka(shaka);

    this.shaka = shaka;
    this.core = new Core({
      ...config?.core,
      // Shaka plays both protocols, so its bundle carries both parsers.
      manifestParsers: config?.core?.manifestParsers ?? [
        hlsManifestParser,
        dashManifestParser,
      ],
    });
  }

  /**
   * Configures and initializes the Shaka Player instance with predefined settings optimized for P2P performance.
   *
   * @param player The Shaka Player instance to configure.
   */
  bindShakaPlayer(player: shaka.Player) {
    if (this.player === player) return;
    if (this.player) this.destroy();

    this.player = player;
    this.managesPresentationDelay =
      player.getConfiguration().manifest.defaultPresentationDelay ===
      SHAKA_DEFAULT_PRESENTATION_DELAY;
    if (this.managesPresentationDelay) {
      this.player.configure(
        "manifest.defaultPresentationDelay",
        INITIAL_LIVE_EDGE_DELAY,
      );
      this.player.configure(
        "manifest.dash.ignoreSuggestedPresentationDelay",
        true,
      );
    }

    const versionMatch = /\d+/.exec(this.shaka.Player.version);
    const versionMajor = parseInt(versionMatch ? versionMatch[0] : "0", 10);
    if (versionMajor >= 5) {
      this.player.configure("streaming.preferNativeHls", false);
    } else {
      this.player.configure("streaming.useNativeHlsOnSafari", false);
    }

    this.updatePlayerEventHandlers("register");
  }

  /**
   * Applies dynamic configuration updates to the P2P engine.
   *
   * @param dynamicConfig The configuration changes to apply.
   *
   * @example
   * // Assuming `shakaP2PEngine` is an instance of ShakaP2PEngine
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
   * shakaP2PEngine.applyDynamicConfig(newDynamicConfig);
   */
  applyDynamicConfig(dynamicConfig: DynamicShakaP2PEngineConfig) {
    if (dynamicConfig.core) this.core.applyDynamicConfig(dynamicConfig.core);
  }

  /**
   * Retrieves the current configuration of the `ShakaP2PEngine`.
   *
   * @returns The configuration as a readonly object.
   */
  getConfig(): ShakaP2PEngineConfig {
    return { core: this.core.getConfig() };
  }

  /**
   * Adds an event listener for the specified event.
   * @param eventName The name of the event to listen for.
   * @param listener The callback function to be invoked when the event is triggered.
   *
   * @example
   * // Listening for a segment being successfully loaded
   * shakaP2PEngine.addEventListener('onSegmentLoaded', (details) => {
   *   console.log('Segment Loaded:', details);
   * });
   *
   * @example
   * // Handling segment load errors
   * shakaP2PEngine.addEventListener('onSegmentError', (errorDetails) => {
   *   console.error('Error loading segment:', errorDetails);
   * });
   *
   * @example
   * // Tracking data downloaded from peers
   * shakaP2PEngine.addEventListener('onChunkDownloaded', (bytesLength, downloadSource, peerId) => {
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

  private updatePlayerEventHandlers = (type: "register" | "unregister") => {
    const { player } = this;
    if (!player) return;

    const networkingEngine: HookedNetworkingEngine | null =
      player.getNetworkingEngine();
    if (networkingEngine) {
      if (type === "register") {
        const p2pml: P2PMLShakaData = {
          player,
          shaka: this.shaka,
          core: this.core,
          onManifestProcessed: this.applyLiveDelay,
        };
        this.requestFilter = (requestType, request) => {
          (request as HookedRequest).p2pml = p2pml;
        };
        networkingEngine.p2pml = p2pml;
        networkingEngine.registerRequestFilter(this.requestFilter);
      } else {
        networkingEngine.p2pml = undefined;
        if (this.requestFilter) {
          networkingEngine.unregisterRequestFilter(this.requestFilter);
        }
      }
    }
    const method =
      type === "register" ? "addEventListener" : "removeEventListener";
    player[method]("loaded", this.handlePlayerLoaded);
    player[method]("loading", this.destroyCurrentStreamContext);
    player[method]("unloading", this.handlePlayerUnloading);
  };

  /**
   * Sizes the presentation delay from the window the core just parsed. The
   * manifest reaches the core before Shaka's parser sees the same bytes, so
   * the value is in place when Shaka builds its timeline. Re-applied only
   * when the window changes by at least half a segment; fractional drift in
   * the window length is not a change.
   */
  private applyLiveDelay = (manifest: ProcessedManifest) => {
    if (!this.player || !this.managesPresentationDelay) return;
    const target = liveDelayFor(manifest);
    if (!target) return;

    const current =
      this.player.getConfiguration().manifest.defaultPresentationDelay;
    if (Math.abs(current - target.delay) < target.segment / 2) return;

    this.debug(`Setting defaultPresentationDelay to ${target.delay}`);
    this.player.configure("manifest.defaultPresentationDelay", target.delay);
  };

  private handlePlayerLoaded = () => {
    this.updateMediaElementEventHandlers("register");
  };

  private handlePlayerUnloading = () => {
    this.destroyCurrentStreamContext();
    this.updateMediaElementEventHandlers("unregister");
  };

  private destroyCurrentStreamContext = () => {
    this.core.destroy();
  };

  private updateMediaElementEventHandlers = (
    type: "register" | "unregister",
  ) => {
    const media = this.player?.getMediaElement();
    if (!media) return;
    const method =
      type === "register" ? "addEventListener" : "removeEventListener";
    for (const event of PLAYBACK_EVENTS) {
      media[method](event, this.handlePlaybackUpdate);
    }
  };

  private handlePlaybackUpdate = (event: Event) => {
    const media = event.target as HTMLVideoElement;
    if (this.oracle.enabled) {
      this.oracle(`media.currentTime=${media.currentTime.toFixed(3)}`);
    }
    this.core.updatePlayback(getPlaybackStateFromMediaElement(media));
  };

  /** Cleans up and releases all resources, and unregisters all event handlers. */
  destroy() {
    this.destroyCurrentStreamContext();
    this.updatePlayerEventHandlers("unregister");
    this.updateMediaElementEventHandlers("unregister");
    this.player = undefined;
  }

  private static registerNetworkingEngineSchemes(shaka: Shaka) {
    const { NetworkingEngine } = shaka.net;

    const handleLoading: shaka.extern.SchemePlugin = (...args) => {
      const request = args[1] as HookedRequest;
      const { p2pml } = request;
      if (!p2pml) {
        return shaka.net.HttpFetchPlugin.parse(
          ...args,
        ) as shaka.extern.IAbortableOperation<shaka.extern.Response>;
      }

      const loader = new Loader(
        p2pml.shaka,
        p2pml.core,
        p2pml.onManifestProcessed,
      );
      return loader.load(...args);
    };
    NetworkingEngine.registerScheme("http", handleLoading);
    NetworkingEngine.registerScheme("https", handleLoading);
    NetworkingEngine.registerScheme("data", handleLoading);
  }

  private static unregisterNetworkingEngineSchemes(shaka: Shaka) {
    const { NetworkingEngine } = shaka.net;
    NetworkingEngine.unregisterScheme("http");
    NetworkingEngine.unregisterScheme("https");
    NetworkingEngine.unregisterScheme("data");
  }

  /**
   * Registers the networking scheme plugins the P2P engine needs into Shaka
   * Player. Plugins must be registered before initializing the player.
   * Shaka's manifest parsers are left as they are.
   *
   * @param shaka The Shaka Player library. Defaults to the global Shaka Player instance if not provided.
   */
  static registerPlugins(shaka = window.shaka) {
    validateShaka(shaka);

    ShakaP2PEngine.registerNetworkingEngineSchemes(shaka);
  }

  /**
   * Unregisters plugins related to P2P functionality from the Shaka Player.
   *
   * @param shaka The Shaka Player library. Defaults to the global Shaka Player instance if not provided.
   */
  static unregisterPlugins(shaka = window.shaka) {
    validateShaka(shaka);

    ShakaP2PEngine.unregisterNetworkingEngineSchemes(shaka);
  }
}

function validateShaka(shaka: unknown) {
  if (!shaka) {
    throw new Error(
      "shaka namespace is not defined in global scope and not passed as an argument to Shaka P2P engine constructor",
    );
  }
}
