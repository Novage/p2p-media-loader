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
  getPlaybackStateFromMediaElement,
  liveDelayFor,
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

const STREAM_INITIALIZED: MediaPlayerEvents["STREAM_INITIALIZED"] =
  "streamInitialized";
const STREAM_TEARDOWN_COMPLETE: MediaPlayerEvents["STREAM_TEARDOWN_COMPLETE"] =
  "streamTeardownComplete";

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
  private media?: HTMLMediaElement;
  private readonly core: Core;
  /** False when the integrator configured a live delay themselves. */
  private managesLiveDelay = false;
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
        onManifestProcessed: this.applyLiveDelay,
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
   * Sizes the live delay from the window the core just parsed. The MPD
   * reaches the core before dash.js parses the same bytes, so the value is in
   * place when dash.js computes its live position. Re-applied only when the
   * window changes by at least half a segment.
   */
  private applyLiveDelay = (manifest: ProcessedManifest) => {
    if (!this.player || !this.managesLiveDelay) return;
    const target = liveDelayFor(manifest);
    if (!target) return;

    const current = this.player.getSettings().streaming?.delay?.liveDelay;
    if (
      current !== undefined &&
      !Number.isNaN(current) &&
      Math.abs(current - target.delay) < target.segment / 2
    ) {
      return;
    }

    this.debug(`Setting liveDelay to ${target.delay}`);
    this.player.updateSettings({
      streaming: { delay: { liveDelay: target.delay } },
    });
  };

  private handleStreamInitialized = () => {
    this.registerMediaElement();
  };

  private handleStreamTeardown = () => {
    this.core.destroy();
    this.unregisterMediaElement();
  };

  private registerMediaElement() {
    let media: HTMLMediaElement | undefined;
    try {
      // Throws until a view is attached.
      media = this.player?.getVideoElement();
    } catch {
      return;
    }
    if (!media || media === this.media) return;
    this.unregisterMediaElement();
    this.media = media;
    for (const event of PLAYBACK_EVENTS) {
      media.addEventListener(event, this.handlePlaybackUpdate);
    }
  }

  private unregisterMediaElement() {
    const { media } = this;
    if (!media) return;
    for (const event of PLAYBACK_EVENTS) {
      media.removeEventListener(event, this.handlePlaybackUpdate);
    }
    this.media = undefined;
  }

  private handlePlaybackUpdate = (event: Event) => {
    const media = event.target as HTMLMediaElement;
    this.core.updatePlayback(getPlaybackStateFromMediaElement(media));
  };

  /** Cleans up and releases all resources, and unregisters all event handlers. */
  destroy() {
    this.core.destroy();
    this.unregisterMediaElement();
    if (this.player) {
      this.player.off(STREAM_INITIALIZED, this.handleStreamInitialized);
      this.player.off(STREAM_TEARDOWN_COMPLETE, this.handleStreamTeardown);
    }
    this.player = undefined;
  }
}
