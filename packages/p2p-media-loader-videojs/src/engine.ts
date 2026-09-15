// Ambient `window.videojs`; referenced explicitly so consumers compiling
// these sources see it too.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./global.d.ts" />
import { hlsManifestParser } from "p2p-media-loader-core/hls";
import { dashManifestParser } from "p2p-media-loader-core/dash";
import {
  Core,
  CoreConfig,
  CoreEventMap,
  DefinedCoreConfig,
  DynamicCoreConfig,
  getPlaybackStateFromMediaElement,
} from "p2p-media-loader-core";
import { RequestRouter, RouterRegistry, createVhsXhr } from "./xhr.js";
import type {
  VhsXhr,
  VideoJsLike,
  VideoJsNamespace,
  VideoJsPlayerLike,
} from "./types.js";

/** Either the real `video.js` namespace or anything shaped like it. */
export type VideoJsInput = VideoJsLike | VideoJsNamespace;

/** A type for specifying dynamic configuration options that can be changed at runtime for the P2P engine's core. */
export type DynamicVideoJsP2PEngineConfig = {
  /** Dynamic core config */
  core?: DynamicCoreConfig;
};

/** Represents the complete configuration for the `VideoJsP2PEngine`. */
export type VideoJsP2PEngineConfig = {
  /** Complete core configuration settings. */
  core: DefinedCoreConfig;
};

/** Allows for partial configuration settings for the `VideoJsP2PEngine`. */
export type PartialVideoJsP2PEngineConfig = {
  /** Partial core config */
  core?: Partial<CoreConfig>;
};

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

/** Routers of every bound engine, consulted by the one global VHS hook. */
const registry = new RouterRegistry();

/**
 * Represents a Peer-to-Peer (P2P) engine designed to enhance media streaming efficiency.
 * This class integrates P2P technologies into video.js — whose HLS and MPEG-DASH playback is VHS,
 * `@videojs/http-streaming` — enabling the distribution of media segments via a peer network
 * alongside traditional HTTP fetching. This reduces server bandwidth costs and improves scalability
 * by sharing the load across multiple clients.
 *
 * The engine has three responsibilities (see specs/player-adapters.md): it
 * hands every playlist and MPD VHS fetches to the core, routes segment
 * requests through the core, and reports playback state from the media
 * element. VHS's own manifest parsing runs untouched; the core parses the same
 * bytes itself.
 *
 * `registerPlugins(videojs)` installs the hook once per page and registers the
 * `p2pMediaLoader` video.js plugin; after that either
 * `player.p2pMediaLoader({ core })` or `new VideoJsP2PEngine({ core })` plus
 * `engine.bindPlayer(player)` attaches an engine to a player.
 *
 * @example
 * VideoJsP2PEngine.registerPlugins(videojs);
 * const player = videojs("video", { html5: { vhs: { overrideNative: true } } });
 * const engine = player.p2pMediaLoader({ core: { swarmId: "example-swarm-id" } });
 * player.src({ src: manifestUrl, type: "application/x-mpegURL" });
 */
export class VideoJsP2PEngine {
  /** The video.js plugin `registerPlugins` adds: `player.p2pMediaLoader(config)`. */
  static readonly PLUGIN_NAME = "p2pMediaLoader";

  private static installed?: { videojs: VideoJsLike; original: VhsXhr };

  private player?: VideoJsPlayerLike;
  private router?: RequestRouter;
  private media?: HTMLMediaElement;
  private readonly core: Core;
  private readonly videojs: VideoJsLike;

  /**
   * Constructs an instance of `VideoJsP2PEngine`.
   *
   * @param config An optional configuration for customizing the P2P engine's behavior.
   * @param videojs The video.js namespace; defaults to the global one.
   */
  constructor(
    config?: PartialVideoJsP2PEngineConfig,
    videojs: VideoJsInput | undefined = window.videojs,
  ) {
    this.videojs = validateVideoJs(videojs);
    this.core = new Core({
      ...config?.core,
      // VHS plays both protocols, so this bundle carries both parsers.
      manifestParsers: config?.core?.manifestParsers ?? [
        hlsManifestParser,
        dashManifestParser,
      ],
    });
  }

  /**
   * Replaces `videojs.Vhs.xhr` — the function VHS calls for every request of
   * every player — with one that routes bound players' requests through
   * their engines, and registers the `p2pMediaLoader` plugin. Call once,
   * before players load a source. The hook does nothing for players without
   * an engine, and nothing on platforms where VHS stands aside (Safari and
   * iOS without `overrideNative`).
   *
   * @param input The video.js namespace; defaults to the global one.
   */
  static registerPlugins(input: VideoJsInput | undefined = window.videojs) {
    const videojs = validateVideoJs(input);
    if (VideoJsP2PEngine.installed?.videojs === videojs) return;
    if (VideoJsP2PEngine.installed) VideoJsP2PEngine.unregisterPlugins();

    const original = videojs.Vhs.xhr;
    videojs.Vhs.xhr = createVhsXhr(videojs, registry, original);
    VideoJsP2PEngine.installed = { videojs, original };

    if (!videojs.getPlugin(VideoJsP2PEngine.PLUGIN_NAME)) {
      videojs.registerPlugin(
        VideoJsP2PEngine.PLUGIN_NAME,
        function p2pMediaLoader(
          this: VideoJsPlayerLike,
          config?: PartialVideoJsP2PEngineConfig,
        ) {
          const engine = new VideoJsP2PEngine(config, videojs);
          engine.bindPlayer(this);
          return engine;
        },
      );
    }
  }

  /**
   * Restores `videojs.Vhs.xhr` and removes the plugin.
   *
   * @param input The video.js namespace; defaults to the one plugins were registered on.
   */
  static unregisterPlugins(
    input: VideoJsInput | undefined = VideoJsP2PEngine.installed?.videojs,
  ) {
    const { installed } = VideoJsP2PEngine;
    const videojs = input as VideoJsLike | undefined;
    if (!installed || !videojs || installed.videojs !== videojs) return;
    videojs.Vhs.xhr = installed.original;
    if (videojs.getPlugin(VideoJsP2PEngine.PLUGIN_NAME)) {
      videojs.deregisterPlugin(VideoJsP2PEngine.PLUGIN_NAME);
    }
    VideoJsP2PEngine.installed = undefined;
  }

  /**
   * Attaches the engine to a video.js player. Its requests are then routed
   * through the core, from the first manifest of the next source it loads.
   *
   * @param player The video.js player.
   */
  bindPlayer(player: VideoJsPlayerLike) {
    if (this.player === player) return;
    if (this.player) this.destroy();

    this.player = player;
    this.router = new RequestRouter(this.core, player, this.videojs);
    registry.add(this.router);
    this.router.attachHook();
    player.on("loadstart", this.handleLoadStart);
    player.on("dispose", this.handleDispose);
    this.registerMediaElement();
  }

  /**
   * Applies dynamic configuration updates to the P2P engine.
   *
   * @param dynamicConfig The configuration changes to apply.
   */
  applyDynamicConfig(dynamicConfig: DynamicVideoJsP2PEngineConfig) {
    if (dynamicConfig.core) this.core.applyDynamicConfig(dynamicConfig.core);
  }

  /**
   * Retrieves the current configuration of the `VideoJsP2PEngine`.
   *
   * @returns The configuration as a readonly object.
   */
  getConfig(): VideoJsP2PEngineConfig {
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

  /** A new source brings a new VHS handler with its own xhr to tag. */
  private handleLoadStart = () => {
    this.router?.attachHook();
    this.registerMediaElement();
  };

  private handleDispose = () => {
    this.destroy();
  };

  private registerMediaElement() {
    const element = this.player?.tech(true).el();
    if (
      typeof HTMLMediaElement === "undefined" ||
      !(element instanceof HTMLMediaElement) ||
      element === this.media
    ) {
      return;
    }
    this.unregisterMediaElement();
    this.media = element;
    for (const event of PLAYBACK_EVENTS) {
      element.addEventListener(event, this.handlePlaybackUpdate);
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
    if (this.router) {
      registry.remove(this.router);
      this.router.detachHooks();
      this.router = undefined;
    }
    if (this.player) {
      this.player.off("loadstart", this.handleLoadStart);
      this.player.off("dispose", this.handleDispose);
    }
    this.player = undefined;
  }
}

function validateVideoJs(videojs: unknown): VideoJsLike {
  if (!videojs) {
    throw new Error(
      "videojs is not defined in global scope and not passed as an argument to the video.js P2P engine",
    );
  }
  const candidate = videojs as Partial<VideoJsLike>;
  if (
    typeof candidate.Vhs?.xhr !== "function" ||
    typeof candidate.xhr !== "function"
  ) {
    throw new Error(
      "videojs.Vhs is missing: the video.js P2P engine needs video.js with VHS (@videojs/http-streaming), bundled since video.js 7",
    );
  }
  return videojs as VideoJsLike;
}
