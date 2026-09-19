import type shaka from "shaka-player/dist/shaka-player.compiled.d.ts";
import { Shaka, HookedRequest, P2PMLShakaData } from "./types.js";
import { Loader } from "./loading-handler.js";
import { BoundPlayer } from "./bound-player.js";
import { defaultPluginFor } from "./default-plugin.js";
import { hlsManifestParser } from "p2p-media-loader-core/hls";
import { dashManifestParser } from "p2p-media-loader-core/dash";
import {
  CoreConfig,
  Core,
  CoreEventMap,
  DynamicCoreConfig,
  DefinedCoreConfig,
  debug,
  runAll,
  trackMediaElementPlayback,
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
 * The engine driving each player, so a second one bound to the same player
 * takes it over rather than running beside it.
 */
const boundEngines = new WeakMap<shaka.Player, ShakaP2PEngine>();

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
  private readonly playback = trackMediaElementPlayback((state, media) => {
    if (this.oracle.enabled) {
      this.oracle(`media.currentTime=${media.currentTime.toFixed(3)}`);
    }
    this.core.updatePlayback(state);
  });
  private readonly shaka: Shaka;
  private readonly core: Core;
  private requestFilter?: shaka.extern.RequestFilter;
  /** The player this engine is bound to, and what it has done to it. */
  private bound?: BoundPlayer;
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
    if (this.bound?.player === player) return;
    // Whatever letting the last player go made of itself, this one is bound:
    // an integrator's segment storage failing to tear down is no reason for
    // the player they are switching to to stream without P2P or live
    // placement for the rest of the session. The failure is raised after.
    const failures: unknown[] = this.bound ? this.releaseBinding() : [];

    // One engine per player. Both would place the same player and stamp its
    // requests for cores of their own, and the first to be destroyed would
    // give back settings the second is still relying on — the live placement,
    // or native HLS, which plays outside the networking engine where nothing
    // can be served at all. Changing what an engine cannot change at runtime,
    // a swarm ID or the trackers, means a new engine, and this is what that
    // costs the old one.
    const previous = boundEngines.get(player);
    if (previous && previous !== this) {
      previous.debug("another engine has taken this player on");
      failures.push(...runAll([() => previous.destroy()]));
    }
    boundEngines.set(player, this);

    this.bound = new BoundPlayer(player, this.shaka, this.debug);
    // Both steps run whatever the other makes of itself. A player that cannot
    // be read — one already being destroyed has no configuration, and Shaka's
    // own accessor throws on it — would otherwise leave this engine bound
    // with no filter and no listeners, and a second bind to the same player
    // returns at the top, so it would stay that way until it is destroyed.
    failures.push(
      ...runAll([
        () => failures.push(...(this.bound?.takeOver() ?? [])),
        () => this.updatePlayerEventHandlers("register"),
      ]),
    );
    if (failures.length) throw failures[0];
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
    const player = this.bound?.player;
    if (!player) return;

    const networkingEngine = player.getNetworkingEngine();
    if (networkingEngine) {
      if (type === "register") {
        // Bound to this binding, not to `this.bound`: a manifest or segment
        // index still in flight when the engine moves to another player
        // describes the source that player was showing, and would otherwise
        // size whichever player is bound when it settles — and latch that
        // one's bookkeeping with the old source's window.
        const { bound } = this;
        const p2pml: P2PMLShakaData = {
          shaka: this.shaka,
          core: this.core,
          currentSource: () =>
            this.bound === bound ? bound?.source : undefined,
          onManifestProcessed: (manifest) => bound?.sizeFrom(manifest),
        };
        this.requestFilter = (requestType, request) => {
          (request as HookedRequest).p2pml = p2pml;
        };
        networkingEngine.registerRequestFilter(this.requestFilter);
      } else {
        if (this.requestFilter) {
          networkingEngine.unregisterRequestFilter(this.requestFilter);
        }
      }
    }
    const method =
      type === "register" ? "addEventListener" : "removeEventListener";
    player[method]("loaded", this.handlePlayerLoaded);
    player[method]("loading", this.handleSourceLoading);
    player[method]("unloading", this.handlePlayerUnloading);
  };

  private handlePlayerLoaded = () => {
    this.updateMediaElementEventHandlers("register");
  };

  /**
   * The player is letting its source go. Ending the source here as well as on
   * `loading` is what keeps a response still in flight from being read back
   * into the core that was just emptied for it: unloading without loading
   * anything after is the one way a source ends that `loading` never sees.
   *
   * Each step runs whatever the ones before it made of themselves, and the
   * core is torn down last: it destroys an integrator's own segment storage
   * and is free to throw, and Shaka only logs what a listener throws.
   */
  private handlePlayerUnloading = () => {
    const failures = runAll([
      () => this.updateMediaElementEventHandlers("unregister"),
      () => this.bound?.startSource(),
      this.destroyCurrentStreamContext,
    ]);
    if (failures.length) throw failures[0];
  };

  /**
   * A new source is a new presentation: what the last one taught this engine,
   * and where its window put the playhead, do not carry over. Before the core is torn down for it,
   * since that tears down an integrator's own segment storage and is free to
   * throw, and Shaka swallows what a listener throws.
   */
  private handleSourceLoading = () => {
    const failures = runAll([
      () => this.bound?.startSource(),
      this.destroyCurrentStreamContext,
    ]);
    if (failures.length) throw failures[0];
  };

  private destroyCurrentStreamContext = () => {
    this.core.destroy();
  };

  private updateMediaElementEventHandlers = (
    type: "register" | "unregister",
  ) => {
    this.playback.watch(
      type === "register"
        ? (this.bound?.player.getMediaElement() ?? undefined)
        : undefined,
    );
  };

  /** Cleans up and releases all resources, and unregisters all event handlers. */
  destroy() {
    const failures = this.releaseBinding();
    if (failures.length) throw failures[0];
  }

  /**
   * Lets the bound player go, running every step whatever the ones before it
   * made of themselves. The core tears down an integrator's own segment
   * storage here and is free to throw; a teardown that stopped there would
   * leave this engine's request filter stamping every request of a player it
   * reports as released, its settings never given back, and what it held
   * ready to be written onto whichever player it is bound to next.
   *
   * @returns What failed along the way, for the caller to raise once there is
   * nothing left to let go of.
   */
  private releaseBinding(): unknown[] {
    const player = this.bound?.player;
    const failures = runAll([
      this.destroyCurrentStreamContext,
      () => this.updatePlayerEventHandlers("unregister"),
      () => this.updateMediaElementEventHandlers("unregister"),
      () => this.bound?.release(),
    ]);
    this.bound = undefined;
    // Only if it is still ours: another engine may have taken it on since.
    if (player && boundEngines.get(player) === this) {
      boundEngines.delete(player);
    }
    return failures;
  }

  private static registerNetworkingEngineSchemes(shaka: Shaka) {
    const { NetworkingEngine } = shaka.net;

    const handleLoading: shaka.extern.SchemePlugin = (...args) => {
      const request = args[1] as HookedRequest;
      const { p2pml } = request;
      if (!p2pml) {
        // A player with no engine bound, on a scheme this registration took
        // over from Shaka: load it the way Shaka would have.
        return defaultPluginFor(shaka, args[0]).parse(...args);
      }

      const loader = new Loader(
        p2pml.shaka,
        p2pml.core,
        p2pml.currentSource,
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
