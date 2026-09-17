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
  trackMediaElementPlayback,
} from "p2p-media-loader-core";
import { FirstManifestHooks, RequestRouter, RouterRegistry } from "./xhr.js";
import type {
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

/** Routers of every bound engine, consulted by the page-wide VHS hooks. */
const registry = new RouterRegistry();

/** The hooks that hand each bound player its first manifest of a source. */
const firstManifestHooks = new FirstManifestHooks(registry);

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
 * One engine serves one player: binding it puts the engine on that player's
 * own VHS request and response hooks. The first manifest request of a source
 * is the one request those hooks cannot see, because VHS sends it from inside
 * the source handler that creates them; VHS runs its page-wide hooks for a
 * player that has none of its own, and the engine reads that manifest there.
 *
 * `registerPlugins(videojs)` is optional, and only registers the
 * `p2pMediaLoader` video.js plugin for integrators who prefer that style.
 *
 * @example
 * // One engine, one player, no page-wide setup
 * const player = videojs("video", { html5: { vhs: { overrideNative: true } } });
 * const engine = new VideoJsP2PEngine({ core: { swarmId: "example-swarm-id" } });
 * engine.bindPlayer(player);
 * player.src({ src: manifestUrl, type: "application/x-mpegURL" });
 *
 * @example
 * // As a video.js plugin, with the page-wide hook in place
 * VideoJsP2PEngine.registerPlugins(videojs);
 * const player = videojs("video", { html5: { vhs: { overrideNative: true } } });
 * const engine = player.p2pMediaLoader({ core: { swarmId: "example-swarm-id" } });
 * player.src({ src: manifestUrl, type: "application/x-mpegURL" });
 */
export class VideoJsP2PEngine {
  /** The video.js plugin `registerPlugins` adds: `player.p2pMediaLoader(config)`. */
  static readonly PLUGIN_NAME = "p2pMediaLoader";

  private static plugin?: VideoJsLike;

  private player?: VideoJsPlayerLike;
  private router?: RequestRouter;
  private hooksInstalled = false;
  private readonly playback = trackMediaElementPlayback((state) =>
    this.core.updatePlayback(state),
  );
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
   * Registers the `p2pMediaLoader` video.js plugin, so that a player can be
   * given an engine with `player.p2pMediaLoader({ core })`. Optional:
   * `new VideoJsP2PEngine(config)` and `engine.bindPlayer(player)` do the
   * same without it. Nothing else on the page is touched.
   *
   * @param input The video.js namespace; defaults to the global one.
   */
  static registerPlugins(input: VideoJsInput | undefined = window.videojs) {
    const videojs = validateVideoJs(input);
    VideoJsP2PEngine.plugin = videojs;

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
   * Removes the `p2pMediaLoader` plugin.
   *
   * @param input The video.js namespace; defaults to the one the plugin was registered on.
   */
  static unregisterPlugins(
    input: VideoJsInput | undefined = VideoJsP2PEngine.plugin,
  ) {
    const videojs = input as VideoJsLike | undefined;
    if (!videojs) return;
    if (videojs.getPlugin(VideoJsP2PEngine.PLUGIN_NAME)) {
      videojs.deregisterPlugin(VideoJsP2PEngine.PLUGIN_NAME);
    }
    if (VideoJsP2PEngine.plugin === videojs) {
      VideoJsP2PEngine.plugin = undefined;
    }
  }

  /**
   * Attaches the engine to a video.js player, hooking that player's own VHS
   * request and response hooks. Its playlists, MPDs and segments go through
   * the core from then on, whether it has a source already or loads one
   * later. Nothing outside this player is touched.
   *
   * @param player The video.js player.
   */
  bindPlayer(player: VideoJsPlayerLike) {
    if (this.player === player) return;
    if (this.player) this.destroy();

    this.player = player;
    this.router = new RequestRouter(this.core, player, this.videojs);
    registry.add(this.router);
    this.hooksInstalled = firstManifestHooks.retain(this.videojs);
    this.router.ensureTopLevelManifest();
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

  /** A new source brings a new VHS handler, with its own xhr to hook. */
  private handleLoadStart = () => {
    this.router?.ensureTopLevelManifest();
    this.registerMediaElement();
  };

  private handleDispose = () => {
    this.destroy();
  };

  private registerMediaElement() {
    const element = this.player?.tech(true)?.el();
    if (
      typeof HTMLMediaElement === "undefined" ||
      !(element instanceof HTMLMediaElement)
    ) {
      return;
    }
    this.playback.watch(element);
  }

  /** Cleans up and releases all resources, and unregisters all event handlers. */
  destroy() {
    this.core.destroy();
    this.playback.stop();
    if (this.router) {
      registry.remove(this.router);
      this.router.detachHooks();
      this.router = undefined;
    }
    if (this.hooksInstalled) {
      firstManifestHooks.release();
      this.hooksInstalled = false;
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
