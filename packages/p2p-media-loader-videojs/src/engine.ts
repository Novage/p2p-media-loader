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
  debug,
  runAll,
  trackMediaElementPlayback,
} from "p2p-media-loader-core";
import { FirstManifestHooks, RequestRouter, RouterRegistry } from "./xhr.js";
import { VhsLivePlacement } from "./live-placement.js";
import type {
  VhsXhr,
  VideoJsLike,
  VideoJsNamespace,
  VideoJsPlayerLike,
} from "./types.js";
import { diagnostics } from "./diagnostics.js";

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
 * The engine driving each player, so a second one bound to the same player
 * takes it over from the first rather than running beside it.
 */
const bound = new WeakMap<VideoJsPlayerLike, VideoJsP2PEngine>();

/**
 * Represents a Peer-to-Peer (P2P) engine designed to enhance media streaming efficiency.
 * This class integrates P2P technologies into Video.js — whose HLS and MPEG-DASH playback is VHS,
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
 * own VHS request and response hooks. VHS creates those hooks with the
 * handler for a source and announces them with `xhr-hooks-ready` before it
 * asks for the manifest, so the engine attaches there and sees every request
 * of the source. A VHS too old to announce them sends its first manifest
 * request through the page-wide hooks instead, which the engine also holds.
 *
 * `registerPlugins(videojs)` is optional, and only registers the
 * `p2pMediaLoader` Video.js plugin for integrators who prefer that style.
 *
 * @example
 * // One engine, one player, no page-wide setup
 * const player = videojs("video", { html5: { vhs: { overrideNative: true } } });
 * const engine = new VideoJsP2PEngine(
 *   { core: { swarmId: "example-swarm-id" } },
 *   videojs, // may be left out where Video.js is on `window`
 * );
 * engine.bindPlayer(player);
 * player.src({ src: streamUrl, type: "application/x-mpegURL" });
 *
 * @example
 * // As a Video.js plugin, with the page-wide hook in place
 * VideoJsP2PEngine.registerPlugins(videojs);
 * const player = videojs("video", { html5: { vhs: { overrideNative: true } } });
 * const engine = player.p2pMediaLoader({ core: { swarmId: "example-swarm-id" } });
 * player.src({ src: streamUrl, type: "application/x-mpegURL" });
 */
export class VideoJsP2PEngine {
  /** The Video.js plugin `registerPlugins` adds: `player.p2pMediaLoader(config)`. */
  static readonly PLUGIN_NAME = "p2pMediaLoader";

  private static plugin?: VideoJsLike;

  private player?: VideoJsPlayerLike;
  private router?: RequestRouter;
  private placement?: VhsLivePlacement;
  /** The page-wide xhr function whose hooks this engine holds, if any. */
  private retainedXhr?: VhsXhr;
  private readonly playback = trackMediaElementPlayback((state) =>
    this.core.updatePlayback(state),
  );
  private readonly core: Core;
  private readonly videojs: VideoJsLike;
  private readonly debug = debug("p2pml-videojs:engine");
  /** The request router and the player handlers; see specs/diagnostics.md. */
  private routerToken?: string;
  private listenersToken?: string;

  /**
   * Constructs an instance of `VideoJsP2PEngine`.
   *
   * @param config An optional configuration for customizing the P2P engine's behavior.
   * @param videojs The Video.js namespace; defaults to the global one.
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
   * Registers the `p2pMediaLoader` Video.js plugin, so that a player can be
   * given an engine with `player.p2pMediaLoader({ core })`. Optional:
   * `new VideoJsP2PEngine(config)` and `engine.bindPlayer(player)` do the
   * same without it. Nothing else on the page is touched.
   *
   * @param input The Video.js namespace; defaults to the global one.
   */
  static registerPlugins(input: VideoJsInput | undefined = window.videojs) {
    const videojs = validateVideoJs(input);
    // Someone else's already, if it is there: a second copy of this package
    // on the page, or an integrator's own plugin under the same name. Taking
    // the record for it would let `unregisterPlugins` tear down a plugin this
    // call never registered, and leave its callers without one.
    if (!videojs.getPlugin(VideoJsP2PEngine.PLUGIN_NAME)) {
      VideoJsP2PEngine.plugin = videojs;
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
   * @param input The Video.js namespace; defaults to the one the plugin was registered on.
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
   * Attaches the engine to a Video.js player, hooking that player's own VHS
   * request and response hooks. Its playlists, MPDs and segments go through
   * the core from then on, whether it has a source already or loads one
   * later. Nothing outside this player is touched.
   *
   * @param player The Video.js player.
   */
  bindPlayer(player: VideoJsPlayerLike) {
    if (this.player === player) return;
    if (this.player) this.destroy();

    // One engine per player. Both would hook the same requests and read every
    // manifest into a core of their own, so one media element would drive two
    // peers in one swarm — each fetching and announcing what the other has.
    // Changing what an engine cannot change at runtime, a swarm ID or the
    // trackers, means a new engine, and this is what that costs the old one.
    const previous = bound.get(player);
    if (previous) {
      previous.debug("another engine has taken this player on");
      previous.destroy();
    }
    bound.set(player, this);

    this.player = player;
    this.placement = new VhsLivePlacement(player);
    this.router = new RequestRouter(
      this.core,
      player,
      this.videojs,
      this.placement.update,
    );
    registry.add(this.router);
    this.retainedXhr = firstManifestHooks.retain(this.videojs);
    player.on("xhr-hooks-ready", this.handleXhrHooksReady);
    player.on("loadstart", this.handleLoadStart);
    player.on("dispose", this.handleDispose);
    this.routerToken = diagnostics?.open("VhsRouter");
    this.listenersToken = diagnostics?.open("VhsPlayerListeners");
    this.router.ensureTopLevelManifest();
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

  /**
   * VHS creates the player's xhr function, and fires this on the player, in
   * the same breath as it creates the handler for a source — and before it
   * asks for that source's manifest. Hooks put on here take every request of
   * the source, its first one included.
   */
  private handleXhrHooksReady = () => {
    this.turnOffLowLatencyHls();
    this.router?.expectFirstManifest();
  };

  /**
   * Plays a low-latency HLS stream by its full segments. VHS plays
   * low-latency HLS unless told otherwise, and then fetches partial segments,
   * which the core does not register (specs/architecture.md), so every
   * request of such a stream would bypass P2P. Written to the handler for
   * this source, which reads it when it creates its playlist loader, right
   * after this event. An `llhls` the integrator gave — on the source, the
   * tech or the page-wide options — is theirs and is left alone. The handler
   * goes with its source, so there is nothing to give back.
   */
  private turnOffLowLatencyHls() {
    const tech = this.player?.tech(true);
    const options = tech?.vhs?.options_;
    if (!options) return;
    const given = [
      tech.vhs?.source_?.llhls,
      tech.options_?.vhs?.llhls,
      this.videojs.options?.vhs?.llhls,
    ];
    if (given.some((value) => value !== undefined)) return;
    options.llhls = false;
  }

  /** A new source brings a new VHS handler, with its own xhr to hook. */
  private handleLoadStart = () => {
    // The next source is placed on its own window, from the player's own
    // settings; what was written for this one is given back.
    this.placement?.release("replaced");
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
    // Each step runs whatever the ones before it made of themselves: the core
    // destroys an integrator's own segment storage and is free to throw, and
    // a teardown that stopped there would leave this router in the page-wide
    // registry with its hooks still on a disposed player.
    const failures = runAll([
      () => this.core.destroy(),
      () => this.playback.stop(),
      () => {
        this.placement?.release("destroyed");
        this.placement = undefined;
      },
      () => {
        if (!this.router) return;
        registry.remove(this.router);
        this.router.detachHooks();
        this.router = undefined;
        diagnostics?.close(this.routerToken, "destroyed");
        this.routerToken = undefined;
      },
      () => {
        if (!this.retainedXhr) return;
        firstManifestHooks.release(this.retainedXhr);
        this.retainedXhr = undefined;
      },
      () => {
        if (!this.player) return;
        this.player.off("xhr-hooks-ready", this.handleXhrHooksReady);
        this.player.off("loadstart", this.handleLoadStart);
        this.player.off("dispose", this.handleDispose);
        diagnostics?.close(this.listenersToken, "destroyed");
        this.listenersToken = undefined;
        // Only if it is still ours: another engine may have taken it on since.
        if (bound.get(this.player) === this) bound.delete(this.player);
      },
    ]);
    this.player = undefined;
    if (failures.length) throw failures[0];
  }
}

function validateVideoJs(videojs: unknown): VideoJsLike {
  if (!videojs) {
    throw new Error(
      "videojs is not defined in global scope and not passed as an argument to the Video.js P2P engine",
    );
  }
  const candidate = videojs as Partial<VideoJsLike>;
  if (
    typeof candidate.Vhs?.xhr !== "function" ||
    typeof candidate.xhr !== "function"
  ) {
    throw new Error(
      "videojs.Vhs is missing: the Video.js P2P engine needs Video.js with VHS (@videojs/http-streaming), bundled since Video.js 7",
    );
  }
  return videojs as VideoJsLike;
}
