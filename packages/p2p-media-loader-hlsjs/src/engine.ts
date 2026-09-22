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
  highDemandWindowFor,
  liveDelayFromWindow,
  playerBufferFor,
  runAll,
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
 * How far beyond the target the re-sync threshold sits, so a viewer who pauses
 * or stalls is brought back to the target before the buffer starves.
 */
const LIVE_RESYNC_MARGIN_SEGMENTS = 2;
/** Fewest fragments a playlist needs before its window is worth tuning for. */
const MIN_TUNABLE_FRAGMENTS = 4;

/** The two HLS.js settings that bound how far ahead of the playhead it fetches. */
const FORWARD_BUFFER_KEYS = ["maxBufferLength", "maxMaxBufferLength"] as const;

type ForwardBufferKey = (typeof FORWARD_BUFFER_KEYS)[number];

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
  /**
   * What this engine last wrote under each forward-buffer key, and what the
   * player holds that it did not write.
   *
   * The ceiling moves with the live window, which on a channel whose DVR
   * window is still filling grows refresh by refresh. Writing only downwards
   * would latch the buffer at the narrowest window ever seen, leaving the
   * player buffering less than the core's high-demand window — the very
   * failure the ceiling exists to prevent. So what this engine wrote is
   * recognisable as its own and moves in either direction, while a value
   * written from outside is somebody else's latest word and caps it.
   */
  private forwardBuffer?: {
    held: Record<ForwardBufferKey, number>;
    applied: Partial<Record<ForwardBufferKey, number>>;
  };
  private readonly debug = debug("p2pml-hlsjs:engine");
  // See HybridLoader.oracleLogger: logs media.currentTime beside the core's
  // estimate, so the two can be compared when the playhead is in doubt.
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
   * Provides the HLS.js configuration the P2P engine needs: its fragment and
   * playlist loaders, and `lowLatencyMode: false` — in low-latency mode
   * HLS.js requests partial segments, which the core does not register, so
   * those requests would bypass P2P. An integration that constructs HLS.js
   * itself spreads this into its config; one that wants low-latency mode
   * regardless sets it after.
   *
   * @returns The fragment loader (`fLoader`), the playlist loader
   * (`pLoader`) and `lowLatencyMode: false`.
   */
  getConfigForHlsJs(): {
    fLoader: unknown;
    pLoader: unknown;
    lowLatencyMode: false;
  } {
    return {
      fLoader: this.createFragmentLoaderClass(),
      pLoader: this.createPlaylistLoaderClass(),
      lowLatencyMode: false,
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
    // Letting the previous instance go may fail — the core destroys an
    // integrator's own segment storage — and the new one is bound whatever
    // that made of itself. This runs inside HLS.js's construction of the
    // playlist loader, where a throw would abort the new source's manifest
    // request, so the failure is logged here rather than raised; `destroy()`
    // called by the integrator raises it.
    // Letting the previous instance go gives back what was written to it,
    // ledger and all; what the next one holds is read when its first playlist
    // arrives.
    const failures = this.currentHlsInstance ? runAll([this.destroy]) : [];
    this.currentHlsInstance = hlsInstance;
    this.updateHlsEventsHandlers("register");
    this.playback.watch(hlsInstance?.media ?? undefined);
    for (const failure of failures) {
      this.debug("letting the previous HLS.js instance go failed: %O", failure);
    }
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
    // Four segments is the narrowest live window worth placing: the buffer
    // sits a segment short of the delay, and the delay a segment inside the
    // tail, so with three there is nothing left between them for peers.
    if (
      this.currentHlsInstance &&
      data.details.fragments.length >= MIN_TUNABLE_FRAGMENTS &&
      data.details.fragments[0].type === ("main" as PlaylistLevelType)
    ) {
      // `EXT-X-TARGETDURATION` is an upper bound, on some streams several
      // times the real segment; the playlist's average is the segment.
      const segment =
        data.details.averagetargetduration ?? data.details.targetduration;
      if (data.details.live) this.updateLiveSync(data.details, segment);

      const { userConfig } = this.currentHlsInstance;
      if (
        userConfig.maxBufferLength === undefined &&
        userConfig.maxMaxBufferLength === undefined
      ) {
        this.updateMaxBufferLength(
          segment,
          data.details.live ? data.details.totalduration : undefined,
        );
      }
    }
  };

  /**
   * Places the player deep in the live window so that the segments between
   * its buffer and the live edge — the ones peers exchange — are as many as
   * the window allows: where exactly is the core's `liveDelayFromWindow` to
   * say, the same answer every adapter gets, and the player's own forward
   * buffer keeps the fetch positions inside the window as the playhead drifts
   * past the tail. Applied through HLS.js's own `targetLatency` API, with a
   * re-sync threshold two segments beyond it. Set once per value; HLS.js then
   * re-syncs to it on start, on a stall, and when the max latency is exceeded.
   *
   * Both or neither: the threshold is derived from this target, and an
   * integrator who set any of the four live sync settings has a target of
   * their own — a threshold written against ours could sit below it, which
   * HLS.js's own config validation forbids, and the count-based settings and
   * the duration-based ones must not be mixed.
   */
  private updateLiveSync(details: LevelDetails, segment: number) {
    const hls = this.currentHlsInstance;
    if (!hls) return;

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
      userConfig.liveSyncDuration !== undefined ||
      userConfig.liveSyncDurationCount !== undefined ||
      userConfig.liveMaxLatencyDuration !== undefined ||
      userConfig.liveMaxLatencyDurationCount !== undefined
    ) {
      return;
    }

    if (differs(hls.config.liveSyncDuration, targetLatency)) {
      this.debug(`Setting targetLatency to ${targetLatency}`);
      hls.targetLatency = targetLatency;
    }
    if (differs(hls.config.liveMaxLatencyDuration, maxLatency)) {
      this.debug(`Setting liveMaxLatencyDuration to ${maxLatency}`);
      hls.config.liveMaxLatencyDuration = maxLatency;
    }
  }

  /**
   * How far ahead of the playhead HLS.js may fetch — `maxBufferLength` is
   * that, in seconds. On a live window it is held a segment short of the live
   * delay, by the rule every adapter shares: the core calls the nearer half of
   * that buffer high-demand and leaves the farther half for peers to fill
   * before the player asks. On VOD it is held to the high-demand window, with
   * a floor of two fragments for a player that could not otherwise keep
   * going: the core's prefetch runs ahead of the player there whatever the
   * player buffers, since nothing bounds the stream ahead.
   *
   * Each setting is a ceiling, not a target: what HLS.js or the integrator
   * holds below it is left alone, and the ceiling itself is never raised
   * above that. Because the window can grow, a ceiling this engine wrote is
   * given back up to it as well as taken down.
   *
   * @param fragmentDuration - The playlist's average fragment length.
   * @param liveWindow - The live window's length, or `undefined` off live.
   */
  private updateMaxBufferLength(
    fragmentDuration: number,
    liveWindow: number | undefined,
  ) {
    if (!this.currentHlsInstance) return;

    let p2pOptimalBufferLength: number;
    if (liveWindow !== undefined && liveWindow > 0 && fragmentDuration > 0) {
      p2pOptimalBufferLength = playerBufferFor({
        delay: liveDelayFromWindow(liveWindow, fragmentDuration),
        segment: fragmentDuration,
      });
    } else {
      // What each stream's loader will actually schedule by, not what was
      // configured: a stream left unconfigured derives the default off live,
      // and a buffer sized under it would leave that stream's segments
      // high-demand the moment the player asks for them.
      const { mainStream, secondaryStream } = this.core.getConfig();
      p2pOptimalBufferLength = Math.max(
        fragmentDuration * 2,
        highDemandWindowFor(mainStream.highDemandTimeWindow, undefined),
        highDemandWindowFor(secondaryStream.highDemandTimeWindow, undefined),
      );
    }

    const { config } = this.currentHlsInstance;
    this.forwardBuffer ??= {
      held: {
        maxBufferLength: config.maxBufferLength,
        maxMaxBufferLength: config.maxMaxBufferLength,
      },
      applied: {},
    };
    const ledger = this.forwardBuffer;

    for (const key of FORWARD_BUFFER_KEYS) {
      const current = config[key];
      // Anything this engine did not write is somebody else's latest word on
      // the setting — the integrator's, or HLS.js's own — which the next
      // write would otherwise hide.
      if (current !== ledger.applied[key]) ledger.held[key] = current;

      const next = Math.min(ledger.held[key], p2pOptimalBufferLength);
      ledger.applied[key] = next;
      if (current === next) continue;
      this.debug(`Setting ${key} to ${next}`);
      config[key] = next;
    }
  }

  private handleMediaAttached = () => {
    this.playback.watch(this.currentHlsInstance?.media ?? undefined);
  };

  private handleMediaDetached = () => {
    this.playback.stop();
  };

  private destroyCore = () => this.core.destroy();

  /**
   * Gives the instance back the forward buffer it came with, while it is
   * still what this engine left there. An integrator who turns P2P off keeps
   * the player, and a ceiling left behind would hold it to a live window it
   * no longer has an engine for — on VOD, for the rest of the session.
   *
   * Only what this engine wrote, and only where nobody has written since: a
   * value changed from outside is their word and stays.
   */
  private restoreForwardBuffer = () => {
    const ledger = this.forwardBuffer;
    this.forwardBuffer = undefined;
    const hls = this.currentHlsInstance;
    if (!ledger || !hls) return;

    for (const key of FORWARD_BUFFER_KEYS) {
      const applied = ledger.applied[key];
      if (applied === undefined || hls.config[key] !== applied) continue;
      this.debug(`Giving ${key} back as ${ledger.held[key]}`);
      hls.config[key] = ledger.held[key];
    }
  };

  /** Cleans up and releases all resources, and unregisters all event handlers. */
  destroy = () => {
    // Each step runs whatever the ones before it made of themselves: the core
    // destroys an integrator's own segment storage and is free to throw, and
    // HLS.js reports what a listener throws as a non-fatal internal exception
    // — so a teardown that stopped there would leave this engine's loaders
    // and listeners on a destroyed instance with nothing to show for it.
    const failures = runAll([
      this.destroyCore,
      () => this.updateHlsEventsHandlers("unregister"),
      this.restoreForwardBuffer,
      () => this.playback.stop(),
    ]);
    this.currentHlsInstance = undefined;
    if (failures.length) throw failures[0];
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
