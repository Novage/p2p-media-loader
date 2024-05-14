import "shaka-player/dist/shaka-player.compiled.d.ts";
import {
  HlsManifestParser,
  DashManifestParser,
} from "./manifest-parser-decorator";
import { SegmentManager } from "./segment-manager";
import {
  StreamInfo,
  Shaka,
  Stream,
  HookedNetworkingEngine,
  HookedRequest,
  P2PMLShakaData,
} from "./types";
import { Loader } from "./loading-handler";
import {
  CoreConfig,
  Core,
  CoreEventMap,
  DynamicCoreConfig,
} from "p2p-media-loader-core";
import { DeepReadonly } from "ts-essentials";

/**
 * Type for specifying dynamic configuration options that can be changed at runtime for the P2P engine's core.
 */
export type DynamicShakaP2PEngineConfig = {
  core?: DynamicCoreConfig;
};

/**
 * Represents the complete configuration for ShakaP2PEngine.
 */
export type ShakaP2PEngineConfig = {
  core: CoreConfig;
};

/**
 * Allows for partial configuration settings for the Shaka P2P Engine.
 */
export type PartialShakaEngineConfig = Partial<
  Omit<ShakaP2PEngineConfig, "core">
> & {
  core?: Partial<CoreConfig>;
};

const LIVE_EDGE_DELAY = 25;

/**
 * Represents a P2P (peer-to-peer) engine for HLS (HTTP Live Streaming) to enhance media streaming efficiency.
 * This class integrates P2P technologies into Shaka Player, enabling the distribution of media segments via a peer network
 * alongside traditional HTTP fetching. It reduces server bandwidth costs and improves scalability by sharing the load
 * across multiple clients.
 *
 * The engine manages core functionalities such as segment fetching, segment management, peer connection management,
 * and event handling related to the P2P and HLS processes.
 *
 * @example
 * // Initializing the ShakaP2PEngine with custom configuration
 * const shakaP2PEngine = new ShakaP2PEngine({
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
 */
export class ShakaP2PEngine {
  private player?: shaka.Player;
  private readonly shaka: Shaka;
  private readonly streamInfo: StreamInfo = {};
  private readonly core: Core<Stream>;
  private readonly segmentManager: SegmentManager;
  private requestFilter?: shaka.extern.RequestFilter;

  /**
   * Constructs an instance of ShakaP2PEngine.
   *
   * @param config Optional configuration for customizing the P2P engine's behavior.
   * @param shaka The Shaka Player library, typically provided as a global variable by including Shaka Player in your project.
   */
  constructor(config?: PartialShakaEngineConfig, shaka = window.shaka) {
    validateShaka(shaka);

    this.shaka = shaka;
    this.core = new Core(config?.core);
    this.segmentManager = new SegmentManager(this.streamInfo, this.core);
  }

  /**
   * Configures and initializes the Shaka Player instance with predefined settings for optimal P2P performance.
   *
   * @param player The Shaka Player instance to configure.
   */
  configureAndInitShakaPlayer(player: shaka.Player) {
    if (this.player === player) return;
    if (this.player) this.destroy();

    this.player = player;
    this.player.configure("manifest.defaultPresentationDelay", LIVE_EDGE_DELAY);
    this.player.configure(
      "manifest.dash.ignoreSuggestedPresentationDelay",
      true,
    );
    this.player.configure("streaming.useNativeHlsOnSafari", false);

    this.updatePlayerEventHandlers("register");
  }

  /**
   * Applies dynamic configuration updates to the P2P engine.
   * This method allows for runtime adjustments to the engine's settings.
   *
   * @param dynamicConfig Configuration changes to apply.
   */
  applyDynamicConfig(dynamicConfig: DeepReadonly<DynamicShakaP2PEngineConfig>) {
    if (dynamicConfig.core) this.core.applyDynamicConfig(dynamicConfig.core);
  }

  /**
   * Retrieves the current configuration of the ShakaP2PEngine.
   *
   * @returns The configuration as a readonly object.
   */
  getConfig(): DeepReadonly<ShakaP2PEngineConfig> {
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
   * // Detecting when a peer connects, useful for monitoring the health of the P2P network
   * shakaP2PEngine.addEventListener('onPeerConnect', (peerId) => {
   *   console.log('Peer connected:', peerId);
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

    const networkingEngine =
      player.getNetworkingEngine() as HookedNetworkingEngine | null;
    if (networkingEngine) {
      if (type === "register") {
        const p2pml: P2PMLShakaData = {
          player,
          shaka: this.shaka,
          core: this.core,
          streamInfo: this.streamInfo,
          segmentManager: this.segmentManager,
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
    player[method]("adaptation", this.onVariantChanged);
    player[method]("variantchanged", this.onVariantChanged);
  };

  private onVariantChanged = () => {
    if (!this.player) return;
    const activeTrack = this.player
      .getVariantTracks()
      .find((track) => track.active);

    if (!activeTrack) return;
    this.core.setActiveLevelBitrate(activeTrack.bandwidth);
  };

  private handlePlayerLoaded = () => {
    if (!this.player) return;
    this.core.setIsLive(this.player.isLive());
    this.updateMediaElementEventHandlers("register");
  };

  private handlePlayerUnloading = () => {
    this.destroyCurrentStreamContext();
    this.updateMediaElementEventHandlers("unregister");
  };

  private destroyCurrentStreamContext = () => {
    this.streamInfo.protocol = undefined;
    this.streamInfo.manifestResponseUrl = undefined;
    this.core.destroy();
  };

  private updateMediaElementEventHandlers = (
    type: "register" | "unregister",
  ) => {
    const media = this.player?.getMediaElement();
    if (!media) return;
    const method =
      type === "register" ? "addEventListener" : "removeEventListener";
    media[method]("timeupdate", this.handlePlaybackUpdate);
    media[method]("ratechange", this.handlePlaybackUpdate);
    media[method]("seeking", this.handlePlaybackUpdate);
  };

  private handlePlaybackUpdate = (event: Event) => {
    const media = event.target as HTMLVideoElement;
    this.core.updatePlayback(media.currentTime, media.playbackRate);
  };

  /**
   * Clean up and release all resources. Unregisters all event handlers.
   */
  destroy() {
    this.destroyCurrentStreamContext();
    this.updatePlayerEventHandlers("unregister");
    this.updateMediaElementEventHandlers("unregister");
    this.player = undefined;
  }

  private static registerManifestParsers(shaka: Shaka) {
    const hlsParserFactory = () => new HlsManifestParser(shaka);
    const dashParserFactory = () => new DashManifestParser(shaka);

    const Parser = shaka.media.ManifestParser;
    Parser.registerParserByMime("application/dash+xml", dashParserFactory);
    Parser.registerParserByMime("application/x-mpegurl", hlsParserFactory);
    Parser.registerParserByMime(
      "application/vnd.apple.mpegurl",
      hlsParserFactory,
    );
  }

  private static unregisterManifestParsers(shaka: Shaka) {
    const Parser = shaka.media.ManifestParser;
    Parser.unregisterParserByMime("mpd");
    Parser.unregisterParserByMime("application/dash+xml");
    Parser.unregisterParserByMime("m3u8");
    Parser.unregisterParserByMime("application/x-mpegurl");
    Parser.unregisterParserByMime("application/vnd.apple.mpegurl");
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

      const loader = new Loader(p2pml.shaka, p2pml.core, p2pml.streamInfo);
      return loader.load(...args);
    };
    NetworkingEngine.registerScheme("http", handleLoading);
    NetworkingEngine.registerScheme("https", handleLoading);
  }

  private static unregisterNetworkingEngineSchemes(shaka: Shaka) {
    const { NetworkingEngine } = shaka.net;
    NetworkingEngine.unregisterScheme("http");
    NetworkingEngine.unregisterScheme("https");
  }

  /**
   * Registers plugins related to P2P functionality into the Shaka Player. This includes setting up custom
   * manifest parsers and networking schemes to enable P2P streaming capabilities.
   *
   * @param {Shaka} [shaka=window.shaka] - The Shaka Player library. Defaults to the global Shaka Player instance if not provided.
   */
  static registerPlugins(shaka = window.shaka) {
    validateShaka(shaka);

    ShakaP2PEngine.registerManifestParsers(shaka);
    ShakaP2PEngine.registerNetworkingEngineSchemes(shaka);
  }

  /**
   * Unregisters plugins related to P2P functionality from the Shaka Player. This is important for cleanly
   * removing the P2P integration, especially when the player is no longer needed or before setting up a new configuration.
   *
   * @param {Shaka} [shaka=window.shaka] - The Shaka Player library. Defaults to the global Shaka Player instance if not provided.
   */
  static unregisterPlugins(shaka = window.shaka) {
    validateShaka(shaka);

    ShakaP2PEngine.unregisterManifestParsers(shaka);
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
