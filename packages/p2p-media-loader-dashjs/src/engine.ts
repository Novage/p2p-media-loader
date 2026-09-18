import type { MediaPlayerClass, MediaPlayerEvents } from "dashjs";
import { dashManifestParser } from "p2p-media-loader-core/dash";
import {
  Core,
  CoreConfig,
  CoreEventMap,
  DefinedCoreConfig,
  DynamicCoreConfig,
  ProcessedManifest,
  debug,
  trackMediaElementPlayback,
  liveDelayFor,
  type LiveDelay,
} from "p2p-media-loader-core";
import { createXhrLoaderExtension } from "./loader.js";

/** A type for specifying dynamic configuration options that can be changed at runtime for the P2P engine's core. */
export type DynamicDashJsP2PEngineConfig = {
  /** Dynamic core config */
  core?: DynamicCoreConfig;
};

/** Represents the complete configuration for the `DashJsP2PEngine`. */
export type DashJsP2PEngineConfig = {
  /** Complete core configuration settings. */
  core: DefinedCoreConfig;
};

/** Allows for partial configuration settings for the `DashJsP2PEngine`. */
export type PartialDashJsP2PEngineConfig = {
  /** Partial core config */
  core?: Partial<CoreConfig>;
};

/**
 * Live delay until the first live manifest says how wide the window is; from
 * then on the delay follows the window (see the core's liveDelayFor). Only
 * applied when the integrator left dash.js's own default in place.
 */
const INITIAL_LIVE_EDGE_DELAY = 25;

/** Least forward buffer to leave the player, whatever the windows work out to. */
const MIN_BUFFER_SEGMENTS = 2;
/** Segments left between the player's forward buffer and the live edge. */
const LIVE_EDGE_MARGIN_SEGMENTS = 1;

/** The three dash.js settings that bound how far ahead of the playhead it fetches. */
type ForwardBuffer = {
  bufferTimeDefault: number;
  bufferTimeAtTopQuality: number;
  bufferTimeAtTopQualityLongForm: number;
};

const STREAM_INITIALIZED: MediaPlayerEvents["STREAM_INITIALIZED"] =
  "streamInitialized";
const STREAM_TEARDOWN_COMPLETE: MediaPlayerEvents["STREAM_TEARDOWN_COMPLETE"] =
  "streamTeardownComplete";

/**
 * Represents a Peer-to-Peer (P2P) engine designed to enhance media streaming efficiency.
 * This class integrates P2P technologies into dash.js, enabling the distribution of media segments via a peer network
 * alongside traditional HTTP fetching. This reduces server bandwidth costs and improves scalability by sharing the load
 * across multiple clients.
 *
 * The engine has three responsibilities (see specs/player-adapters.md): it
 * hands every MPD dash.js fetches to the core, routes segment requests
 * through the core, and reports playback state from the media element. dash.js's
 * own manifest parsing runs untouched; the core parses the same bytes itself.
 *
 * @example
 * const player = dashjs.MediaPlayer().create();
 * const engine = new DashJsP2PEngine({
 *   core: {
 *     swarmId: "example-swarm-id",
 *     announceTrackers: ["wss://personal.tracker.com"],
 *   },
 * });
 * engine.bindPlayer(player); // before initialize()
 * player.initialize(videoElement, manifestUrl, true);
 */
export class DashJsP2PEngine {
  private player?: MediaPlayerClass;
  private readonly playback = trackMediaElementPlayback((state) =>
    this.core.updatePlayback(state),
  );
  private readonly core: Core;
  /** False when the integrator configured a live delay themselves. */
  private managesLiveDelay = false;
  /** The live delay this engine placed, if any; see `applyLivePlacement`. */
  private appliedLiveDelay?: number;
  /** The forward buffer this engine placed, if any; see `forwardBufferSettings`. */
  private appliedBuffer?: ForwardBuffer;
  private readonly debug = debug("p2pml-dashjs:engine");

  /**
   * Constructs an instance of `DashJsP2PEngine`.
   *
   * @param config An optional configuration for customizing the P2P engine's behavior.
   */
  constructor(config?: PartialDashJsP2PEngineConfig) {
    this.core = new Core({
      ...config?.core,
      // dash.js plays DASH only, so its bundle carries the DASH parser only.
      manifestParsers: config?.core?.manifestParsers ?? [dashManifestParser],
    });
  }

  /**
   * Hooks the engine into a dash.js player. Call before `player.initialize()`:
   * the engine replaces the player's `XHRLoader` through `player.extend`,
   * which dash.js resolves when it first loads.
   *
   * @param player The dash.js `MediaPlayer` instance.
   */
  bindPlayer(player: MediaPlayerClass) {
    if (this.player === player) return;
    if (this.player) this.destroy();
    this.player = player;

    const liveDelay = player.getSettings().streaming?.delay?.liveDelay;
    this.managesLiveDelay = liveDelay === undefined || Number.isNaN(liveDelay);
    this.appliedLiveDelay = undefined;
    if (this.managesLiveDelay) {
      player.updateSettings({
        streaming: {
          delay: {
            liveDelay: INITIAL_LIVE_EDGE_DELAY,
            // A server's suggestion places the player near the edge, where
            // there is nothing to share.
            useSuggestedPresentationDelay: false,
          },
        },
      });
    }

    player.extend(
      "XHRLoader",
      createXhrLoaderExtension(this.core, {
        onManifestProcessed: this.applyLivePlacement,
      }),
      true,
    );

    player.on(STREAM_INITIALIZED, this.handleStreamInitialized);
    player.on(STREAM_TEARDOWN_COMPLETE, this.handleStreamTeardown);
    this.registerMediaElement();
  }

  /**
   * Applies dynamic configuration updates to the P2P engine.
   *
   * @param dynamicConfig The configuration changes to apply.
   */
  applyDynamicConfig(dynamicConfig: DynamicDashJsP2PEngineConfig) {
    if (dynamicConfig.core) this.core.applyDynamicConfig(dynamicConfig.core);
  }

  /**
   * Retrieves the current configuration of the `DashJsP2PEngine`.
   *
   * @returns The configuration as a readonly object.
   */
  getConfig(): DashJsP2PEngineConfig {
    return { core: this.core.getConfig() };
  }

  /**
   * Adds an event listener for the specified event.
   * @param eventName The name of the event to listen for.
   * @param listener The callback function to be invoked when the event is triggered.
   *
   * @example
   * engine.addEventListener('onSegmentLoaded', (details) => {
   *   console.log('Segment Loaded:', details);
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
   * Places the player in the live window from the window the core just
   * parsed: how far behind the edge it plays, and how far ahead of the
   * playhead it may fetch. The MPD reaches the core before dash.js parses the
   * same bytes, so both are in place when dash.js computes its live position.
   * Re-applied only when the window changes by at least half a segment.
   */
  private applyLivePlacement = (manifest: ProcessedManifest) => {
    if (!this.player || !this.managesLiveDelay) return;
    const target = liveDelayFor(manifest);
    if (!target) return;

    // Against the delay this placed, never against the one the player holds:
    // until a window is known that is INITIAL_LIVE_EDGE_DELAY, and a first
    // window whose delay lands within half a segment of it would read as
    // already placed. The delay would happen to be right and the forward
    // buffer would be left at dash.js's own minute, which is the half that
    // decides whether anything is shared at all.
    if (
      this.appliedLiveDelay !== undefined &&
      Math.abs(this.appliedLiveDelay - target.delay) < target.segment / 2
    ) {
      return;
    }

    const buffer = this.forwardBufferSettings(target);
    this.debug(
      `Setting liveDelay to ${target.delay}, forward buffer to ${buffer.bufferTimeDefault}`,
    );
    this.player.updateSettings({
      streaming: { delay: { liveDelay: target.delay }, buffer },
    });
    this.appliedLiveDelay = target.delay;
    this.appliedBuffer = buffer;
  };

  /**
   * How far ahead of the playhead dash.js may fetch: the high-demand window,
   * never closer to the live edge than a segment, never less than a couple of
   * segments. The segments beyond it are the core's to prefetch, and they are
   * the ones peers exchange.
   *
   * Left alone, dash.js buffers `bufferTimeAtTopQualityLongForm` — a minute,
   * since a dynamic stream is long-form by its duration — which on a live
   * stream is the whole window. Its playhead then sits a live delay behind the
   * edge while its *fetch* position rides the edge itself, where the registry
   * cannot yet know the segment: core learns of one only when dash.js refreshes
   * the MPD, and dash.js derives availability from its own synced clock. Every
   * such request misses the registry and falls through to dash.js's own loader,
   * so the stream plays perfectly with no P2P at all.
   *
   * Settings the integrator already holds below this are left alone; the value
   * is a ceiling, not a target.
   */
  private forwardBufferSettings(target: LiveDelay) {
    const { mainStream, secondaryStream } = this.core.getConfig();
    const highDemandTimeWindow = Math.max(
      mainStream.highDemandTimeWindow,
      secondaryStream.highDemandTimeWindow,
    );
    const bufferTime = Math.max(
      target.segment * MIN_BUFFER_SEGMENTS,
      Math.min(
        highDemandTimeWindow,
        target.delay - target.segment * LIVE_EDGE_MARGIN_SEGMENTS,
      ),
    );

    const current = this.player?.getSettings().streaming?.buffer;
    const applied = this.appliedBuffer;
    // A setting this engine wrote is not one to hold to: reading it back as
    // the integrator's would let the ceiling only ever fall, and a window
    // that grows — a stream whose timeline fills out after it starts
    // publishing — would keep the buffer it needed when it was seconds long.
    const lower = (setting: number | undefined, ours: number | undefined) =>
      setting === undefined ||
      Number.isNaN(setting) ||
      setting === ours ||
      setting > bufferTime
        ? bufferTime
        : setting;

    return {
      bufferTimeDefault: lower(
        current?.bufferTimeDefault,
        applied?.bufferTimeDefault,
      ),
      bufferTimeAtTopQuality: lower(
        current?.bufferTimeAtTopQuality,
        applied?.bufferTimeAtTopQuality,
      ),
      bufferTimeAtTopQualityLongForm: lower(
        current?.bufferTimeAtTopQualityLongForm,
        applied?.bufferTimeAtTopQualityLongForm,
      ),
    };
  }

  private handleStreamInitialized = () => {
    this.registerMediaElement();
  };

  private handleStreamTeardown = () => {
    this.core.destroy();
    this.playback.stop();
  };

  private registerMediaElement() {
    let media: HTMLMediaElement | undefined;
    try {
      // Throws until a view is attached.
      media = this.player?.getVideoElement();
    } catch {
      return;
    }
    if (media) this.playback.watch(media);
  }

  /** Cleans up and releases all resources, and unregisters all event handlers. */
  destroy() {
    this.core.destroy();
    this.playback.stop();
    if (this.player) {
      this.player.off(STREAM_INITIALIZED, this.handleStreamInitialized);
      this.player.off(STREAM_TEARDOWN_COMPLETE, this.handleStreamTeardown);
    }
    this.player = undefined;
    this.appliedLiveDelay = undefined;
    this.appliedBuffer = undefined;
  }
}
