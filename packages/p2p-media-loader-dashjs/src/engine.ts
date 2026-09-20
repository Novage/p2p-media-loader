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
  runAll,
  trackMediaElementPlayback,
  liveDelayFor,
  type LiveDelay,
  INITIAL_LIVE_DELAY,
} from "p2p-media-loader-core";
import { createXhrLoaderExtension, type LoaderBinding } from "./loader.js";

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

/** Least forward buffer to leave the player, whatever the windows work out to. */
const MIN_BUFFER_SEGMENTS = 2;
/** Segments left between the player's forward buffer and the live edge. */
const LIVE_EDGE_MARGIN_SEGMENTS = 1;

/** The three dash.js settings that bound how far ahead of the playhead it fetches. */
const FORWARD_BUFFER_KEYS = [
  "bufferTimeDefault",
  "bufferTimeAtTopQuality",
  "bufferTimeAtTopQualityLongForm",
] as const;

type ForwardBuffer = Record<(typeof FORWARD_BUFFER_KEYS)[number], number>;
/** What the player holds under those keys: a length, or a value that is not one. */
type HeldBuffer = Partial<Record<keyof ForwardBuffer, number | null>>;

type Placement = {
  /** False where the integrator placed the player in the live window. */
  readonly managed: boolean;
  /**
   * What the player held before this engine wrote any of it, and what it is
   * given back — every value under the buffer keys, a length or not, so that
   * a key the integrator held as `null` is not left holding a ceiling. The
   * buffer part is a ledger, kept by `noteOutsideBufferWrites`: it follows
   * later writes from outside — the integrator's, and dash.js's own when a
   * quota error makes it shrink the buffer it can afford — keeping the latest
   * of them rather than the lowest, so the last word on a setting is the one
   * honoured and the one restored. A later write to the delay is the
   * integrator placing the player themselves, and hands the whole placement
   * back.
   */
  readonly held: {
    readonly liveDelay?: number;
    readonly useSuggestedPresentationDelay?: boolean;
    readonly buffer: HeldBuffer;
  };
};

/**
 * The engine driving a player's requests, by player. dash.js keeps an
 * `XHRLoader` extension for the life of the player and ignores every later
 * `extend` for the same name, so the extension the first engine installs must
 * serve whichever engine is bound now — a second engine would otherwise
 * install nothing and quietly do nothing.
 */
const bindings = new WeakMap<MediaPlayerClass, LoaderBinding>();

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
  /**
   * What this engine found and what it decided when it took the current
   * source over, or undefined before the first live manifest of one. Read
   * then rather than at bind: `bindPlayer` runs before `initialize`, and the
   * settings an integrator passes in between are theirs to keep.
   */
  private placement?: Placement;
  /** The live delay this engine wrote, if any; see `applyLivePlacement`. */
  private appliedLiveDelay?: number;
  /** The forward buffer this engine wrote, if any; see `forwardBufferSettings`. */
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
    // Whatever letting go of the last player, or taking this one off the
    // engine that had it, makes of itself: this player is bound either way.
    // A failure there raised from the middle of a bind would leave this
    // engine holding the player with none of its handlers on it, and a second
    // bind to the same player returns at the top — so it would stay that way,
    // while the engine that was released keeps every request routed to a core
    // it has already reset. What failed is raised once the bind is complete.
    const failures = runAll([
      () => {
        if (this.player) this.destroy();
      },
    ]);
    this.player = player;

    // The player's settings are read when the first live manifest of a source
    // arrives, not here: `bindPlayer` runs before `initialize`, so what the
    // integrator configures in between would otherwise be taken for dash.js's
    // own defaults and overwritten. (The placement state is empty here: the
    // release above cleared it, or there was never a player to fill it.)
    // An engine that had this player gives it back before this one reads it:
    // a delay left behind by another engine is indistinguishable from one the
    // integrator set, and would be read as a placement that is not ours.
    failures.push(...runAll([() => bindings.get(player)?.release?.()]));
    bindings.set(player, {
      core: this.core,
      onManifestProcessed: this.applyLivePlacement,
      release: this.releasePlayer,
    });
    player.extend(
      "XHRLoader",
      createXhrLoaderExtension(() => bindings.get(player)),
      true,
    );

    player.on(STREAM_INITIALIZED, this.handleStreamInitialized);
    player.on(STREAM_TEARDOWN_COMPLETE, this.handleStreamTeardown);
    this.registerMediaElement();
    if (failures.length) throw failures[0];
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
   * Re-applied when the window moves by at least half a segment, or when
   * anything else it writes would change.
   */
  private applyLivePlacement = (manifest: ProcessedManifest) => {
    if (!this.player) return;
    const target = liveDelayFor(manifest);
    if (!target) {
      if (manifest.streams.some((stream) => stream.isLive)) {
        // Live, but not yet measurable — a `SegmentBase` stream has no
        // segments until its index is fetched. Hold the player off the edge
        // until a refresh can size the window.
        this.holdOffTheEdge();
      } else {
        // A presentation with nothing live in it is not this engine's to
        // place — and is the one that would otherwise inherit a live window's
        // ceiling, since the settings are the player's and outlive the source.
        this.restorePlacement();
      }
      return;
    }

    if (!this.takeOver()) return;
    const { streaming } = this.player.getSettings();

    // A delay the player holds that this engine did not write is the
    // integrator placing the player themselves, after the fact: the
    // placement is theirs from here. What this engine wrote to the buffer
    // is given back; the delay is left as they set it, and the next manifest
    // reads it as theirs.
    const delayNow = streaming?.delay?.liveDelay;
    if (
      this.appliedLiveDelay !== undefined &&
      isConfigured(delayNow) &&
      delayNow !== this.appliedLiveDelay
    ) {
      this.debug("liveDelay was set from outside; the placement is theirs");
      this.restorePlacement();
      return;
    }

    this.noteOutsideBufferWrites();
    const buffer = this.forwardBufferSettings(target);

    // The two halves are compared and written independently. The delay is
    // compared against what this engine placed, never against what the
    // player holds: its own pre-manifest delay would otherwise read as a
    // placement. A window that moved by less than half a segment is the same
    // window — segment durations are not exact multiples — and rewriting the
    // delay for it would move the target dash.js measures its catch-up
    // against for nothing; so a change to the buffer alone writes the buffer
    // alone. `useSuggestedPresentationDelay` is this engine's too: turned back
    // on from outside, dash.js would park the player near the edge.
    //
    // The buffer is compared against what the player holds, because a ceiling
    // is only a ceiling while it is enforced: a setting raised from outside —
    // by the integrator, the only one who raises these — must be brought back
    // down, and comparing against what this engine last intended would leave
    // it raised for as long as the window holds steady.
    const delayMoved =
      this.appliedLiveDelay === undefined ||
      Math.abs(this.appliedLiveDelay - target.delay) >= target.segment / 2 ||
      streaming?.delay?.useSuggestedPresentationDelay !== false;
    const held = streaming?.buffer;
    const bufferChanged = FORWARD_BUFFER_KEYS.some(
      (key) => held?.[key] !== buffer[key],
    );
    if (!delayMoved && !bufferChanged) {
      // Nothing to write, but this is what the player holds and this engine
      // asked for, so it is this engine's — recording it keeps a later change
      // from outside recognisable as one.
      this.appliedBuffer = buffer;
      return;
    }

    const update: {
      delay?: { liveDelay: number; useSuggestedPresentationDelay: boolean };
      buffer?: ForwardBuffer;
    } = {};
    if (delayMoved) {
      this.debug(`Setting liveDelay to ${target.delay}`);
      update.delay = {
        liveDelay: target.delay,
        // A server's suggestion places the player near the edge, where
        // there is nothing to share.
        useSuggestedPresentationDelay: false,
      };
    }
    if (bufferChanged) {
      this.debug(`Setting forward buffer to ${buffer.bufferTimeDefault}`);
      update.buffer = buffer;
    }
    this.player.updateSettings({ streaming: update });
    if (delayMoved) this.appliedLiveDelay = target.delay;
    this.appliedBuffer = buffer;
  };

  /**
   * Keeps the ledger of what the player holds under the buffer keys that this
   * engine did not write: somebody else's latest word on the setting — the
   * integrator's, or dash.js's own when a quota error makes it shrink the two
   * top-quality buffers it can no longer afford — which the next write would
   * hide. Reading back what the engine wrote as theirs instead would let the
   * ceiling only ever fall, and treating it as nobody's would raise a setting
   * held below the ceiling, which is the one thing a ceiling must not do.
   */
  private noteOutsideBufferWrites() {
    const current = this.player?.getSettings().streaming?.buffer;
    const ceilings = this.placement?.held.buffer;
    if (!ceilings) return;
    for (const key of FORWARD_BUFFER_KEYS) {
      const value = current?.[key];
      if (isBufferTime(value) && value !== this.appliedBuffer?.[key]) {
        ceilings[key] = value;
      }
    }
  }

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

    const ceilings: HeldBuffer = this.placement?.held.buffer ?? {};
    const settings = {} as ForwardBuffer;
    for (const key of FORWARD_BUFFER_KEYS) {
      const held = ceilings[key];
      settings[key] =
        isBufferTime(held) && held < bufferTime ? held : bufferTime;
    }
    return settings;
  }

  private handleStreamInitialized = () => {
    this.registerMediaElement();
  };

  /**
   * The player has finished tearing a stream down. dash.js calls this from
   * its own event bus, which invokes handlers with no `try` of its own: a
   * throw here aborts `StreamController`'s reset half way — leaving its
   * streams, media-error and autoplay state stale, and the controllers after
   * it never reset — and surfaces out of the integrator's `attachSource`.
   * So each step runs on its own and what failed is logged, not raised.
   *
   * The core goes last, because it is the step that can fail: it destroys an
   * integrator's own segment storage, which is free to throw.
   */
  private handleStreamTeardown = () => {
    const failures = runAll([
      () => this.playback.stop(),
      // The next source starts from the player's own settings, and is placed
      // on its own window rather than measured against this one's.
      () => this.restorePlacement(),
      () => this.core.destroy(),
    ]);
    for (const failure of failures) {
      this.debug("tearing the stream down failed: %O", failure);
    }
  };

  /**
   * Takes the current source over, once, on its first live manifest: reads
   * what the player holds — which is the integrator's, since nothing of this
   * engine's has been written for this source — and decides from it whether
   * the placement is theirs or ours.
   *
   * dash.js places the player from `liveDelay` when it has one and from
   * `liveDelayFragmentCount` otherwise, so either one is an integrator who
   * placed it themselves. `useSuggestedPresentationDelay` is not: it is on by
   * default, so it says nothing about what they chose.
   *
   * @returns whether this engine places this source.
   */
  private takeOver(): boolean {
    if (this.placement) return this.placement.managed;
    const { player } = this;
    if (!player) return false;

    const delay = player.getSettings().streaming?.delay;
    this.placement = {
      managed:
        !isConfigured(delay?.liveDelay) &&
        !isConfigured(delay?.liveDelayFragmentCount),
      held: {
        liveDelay: delay?.liveDelay,
        useSuggestedPresentationDelay: delay?.useSuggestedPresentationDelay,
        buffer: readForwardBuffer(player),
      },
    };
    return this.placement.managed;
  }

  /**
   * Where a live player sits until a manifest says how wide its window is.
   * Written for each source that needs it rather than once for the player: a
   * source whose window cannot be sized yet would otherwise be left wherever
   * dash.js puts it, which is at the edge, where there is nothing to share.
   */
  private holdOffTheEdge() {
    if (!this.takeOver() || !this.player) return;
    if (this.appliedLiveDelay !== undefined) return;

    this.debug(`Holding liveDelay at ${INITIAL_LIVE_DELAY}`);
    this.player.updateSettings({
      streaming: {
        delay: {
          liveDelay: INITIAL_LIVE_DELAY,
          // A server's suggestion places the player near the edge, where
          // there is nothing to share.
          useSuggestedPresentationDelay: false,
        },
      },
    });
    this.appliedLiveDelay = INITIAL_LIVE_DELAY;
  }

  /**
   * Puts back what the player held before this engine wrote anything: the
   * delay and the buffer alike, since they are the two halves of one
   * placement. dash.js keeps both across `attachSource`, so a live window's
   * ceiling would otherwise be inherited by whatever plays next — a VOD
   * source included — and a delay left behind would park the player where P2P
   * wanted it for as long as the player lives.
   *
   * The next source is taken over afresh, and placed on its own window rather
   * than measured against this one's.
   */
  private restorePlacement() {
    const { placement, appliedLiveDelay, appliedBuffer } = this;
    this.placement = undefined;
    this.appliedLiveDelay = undefined;
    this.appliedBuffer = undefined;
    if (!this.player || !placement) return;

    // Each half is given back only if this engine wrote it. A live window it
    // only held the player in never had its buffer touched, and writing one
    // back would revert whatever the integrator has set since.
    const streaming: {
      delay?: { liveDelay: number; useSuggestedPresentationDelay?: boolean };
      buffer?: HeldBuffer;
    } = {};
    const { held } = placement;

    // The delay only while it is still this engine's: written over from
    // outside since, it is the integrator's word, and stays.
    const delayNow = this.player.getSettings().streaming?.delay?.liveDelay;
    if (appliedLiveDelay !== undefined && delayNow === appliedLiveDelay) {
      streaming.delay = {
        // NaN is how dash.js says a delay was never configured.
        liveDelay: held.liveDelay ?? NaN,
        ...(held.useSuggestedPresentationDelay === undefined
          ? {}
          : {
              useSuggestedPresentationDelay: held.useSuggestedPresentationDelay,
            }),
      };
    }

    if (appliedBuffer) {
      // Every key that was held, whatever it held: a `null` given back is a
      // `null`, not a ceiling left behind.
      const buffer: HeldBuffer = {};
      for (const key of FORWARD_BUFFER_KEYS) {
        if (key in held.buffer) buffer[key] = held.buffer[key];
      }
      if (Object.keys(buffer).length > 0) streaming.buffer = buffer;
    }

    if (Object.keys(streaming).length === 0) return;
    this.debug("Restoring the placement the player came with");
    this.player.updateSettings({
      streaming: streaming as Parameters<
        MediaPlayerClass["updateSettings"]
      >[0]["streaming"],
    });
  }

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
    // Only if it is still ours: another engine may have taken this player on
    // since, and it has already been given back to it.
    if (this.player && bindings.get(this.player)?.core === this.core) {
      bindings.delete(this.player);
    }
    this.releasePlayer();
  }

  /**
   * Lets the player go: stops working for it, gives back what was written to
   * it, and forgets it. Called on `destroy`, and by the next engine to bind
   * the same player.
   *
   * An engine with no player has nothing to load for, so its core is reset
   * and its playback tracker detached. Leaving them running would keep a
   * second core fetching and announcing in the swarm the engine that took the
   * player over is in, driven by the same media element.
   *
   * Every step runs whatever the ones before it made of themselves: the core
   * destroys an integrator's own segment storage and is free to throw, and
   * stopping there would leave the media element reporting playback into a
   * destroyed core, this engine's handlers on the player, and the player
   * carrying the live delay and buffer ceilings this engine wrote. What
   * failed is raised once there is nothing left to let go of — to whoever
   * asked, which on the takeover path is the engine binding this player next,
   * and which is why that one collects it rather than letting it abort a bind
   * already under way.
   */
  private releasePlayer = () => {
    const failures = runAll([
      () => this.playback.stop(),
      () => {
        if (!this.player) return;
        this.player.off(STREAM_INITIALIZED, this.handleStreamInitialized);
        this.player.off(STREAM_TEARDOWN_COMPLETE, this.handleStreamTeardown);
      },
      () => this.restorePlacement(),
      () => this.core.destroy(),
    ]);
    this.player = undefined;
    if (failures.length) throw failures[0];
  };
}

/** The forward buffer settings a player currently holds. */
function readForwardBuffer(player: MediaPlayerClass): HeldBuffer {
  const buffer = player.getSettings().streaming?.buffer;
  const held: HeldBuffer = {};
  for (const key of FORWARD_BUFFER_KEYS) {
    const value = buffer?.[key];
    if (value !== undefined) held[key] = value;
  }
  return held;
}

/**
 * Whether a buffer setting the player holds is a length this engine can reason
 * about. dash.js validates nothing an integrator passes to `updateSettings`
 * and its own typings promise a number, so a `null` left by someone clearing
 * a setting would otherwise be read as a length, compared as zero, and handed
 * back to the player as its ceiling.
 */
function isBufferTime(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

/** Whether a dash.js setting holds a value rather than its unset default. */
function isConfigured(value: number | null | undefined): boolean {
  return value !== undefined && value !== null && !Number.isNaN(value);
}
