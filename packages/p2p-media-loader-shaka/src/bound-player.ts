import type shaka from "shaka-player/dist/shaka-player.compiled.d.ts";
import {
  type ProcessedManifest,
  liveDelayFor,
  INITIAL_LIVE_DELAY,
} from "p2p-media-loader-core";
import type { Shaka } from "./types.js";

/** Shaka's own default: the integrator has set no presentation delay. */
const SHAKA_DEFAULT_PRESENTATION_DELAY = 0;

/**
 * What the engine has done to the player it is bound to, and what it has
 * learned about the source playing on it.
 *
 * Two lifetimes, owned here together because every defect in this area has
 * been one of them getting out of step with the other:
 *
 * - **The binding.** Every setting taken from the player is given back when
 *   the engine lets it go — all of them, or a player outlives its engine
 *   carrying a placement nothing manages, and a later binding reads what this
 *   one wrote as the integrator's own choice.
 * - **The source.** What its manifests said about its window, and whether any
 *   of them described a main stream, say nothing about the next source. The
 *   player goes back to the pre-manifest delay with them, or a source whose
 *   own manifests size nothing is placed by the one before it.
 */
export class BoundPlayer {
  /** What the player held before this engine wrote each path. */
  readonly #taken = new Map<string, unknown>();
  readonly #player: shaka.Player;
  readonly #debug: (message: string) => void;
  /**
   * Whether the live placement is this engine's to make. False when the
   * integrator configured a presentation delay of their own, which is theirs.
   */
  #sizesLiveWindow = false;
  readonly #shaka: Shaka;
  /** The delay this engine applied for the current source, if any. */
  #applied?: number;
  /**
   * Whether any manifest of the current source described a live main stream.
   * Kept here rather than had from the core: `processManifest` describes the
   * streams the manifest listed, and making it describe the whole
   * presentation instead was tried and pinned the delay to streams the
   * presentation no longer had.
   */
  #seenMainStream = false;

  /**
   * Whether this binding has been let go. A response still in flight when it
   * was belongs to the player it was made for, and that player is no longer
   * this engine's to place.
   */
  #released = false;
  /**
   * Stands for the source playing now. A fresh one each time a source starts,
   * so a response can be told to belong to the presentation before it — not
   * only to a player before it.
   */
  #source: object = {};

  constructor(
    player: shaka.Player,
    shakaLib: Shaka,
    debug: (message: string) => void,
  ) {
    this.#player = player;
    this.#shaka = shakaLib;
    this.#debug = debug;
  }

  /**
   * Takes the settings this engine needs from the player, keeping what it
   * held for each. Separate from construction so the engine records this
   * binding before anything is written: a write that failed half way through
   * construction would otherwise strand what came before it on the player,
   * with nothing left holding what to give back.
   *
   * @returns What failed along the way, each path attempted regardless.
   */
  takeOver(): unknown[] {
    const failures: unknown[] = [];
    const take = (path: string, value: unknown, previous: unknown) => {
      if (!this.#taken.has(path)) this.#taken.set(path, previous);
      try {
        this.#player.configure(path, value);
      } catch (failure) {
        failures.push(failure);
      }
    };

    // A player already being destroyed has no configuration, and Shaka's own
    // accessor throws on it: as much a failure of the takeover as a
    // `configure` that throws, reported the same way.
    let configuration: ReturnType<shaka.Player["getConfiguration"]>;
    try {
      configuration = this.#player.getConfiguration();
    } catch (failure) {
      failures.push(failure);
      return failures;
    }
    const { manifest, streaming } = configuration;
    this.#sizesLiveWindow =
      manifest.defaultPresentationDelay === SHAKA_DEFAULT_PRESENTATION_DELAY;
    if (this.#sizesLiveWindow) {
      take(
        "manifest.defaultPresentationDelay",
        INITIAL_LIVE_DELAY,
        manifest.defaultPresentationDelay,
      );
      take(
        "manifest.dash.ignoreSuggestedPresentationDelay",
        true,
        manifest.dash.ignoreSuggestedPresentationDelay,
      );
    }

    // Native HLS plays outside the networking engine, where nothing can be
    // served. Taken from every player, including one whose delay is the
    // integrator's own, and so given back to every player too.
    const versionMatch = /\d+/.exec(this.#shaka.Player.version);
    const versionMajor = parseInt(versionMatch ? versionMatch[0] : "0", 10);
    const nativeHls =
      versionMajor >= 5 ? "preferNativeHls" : "useNativeHlsOnSafari";
    take(
      `streaming.${nativeHls}`,
      false,
      (streaming as unknown as Record<string, unknown>)[nativeHls],
    );
    return failures;
  }

  get player(): shaka.Player {
    return this.#player;
  }

  /** What a request can hold on to, to know which presentation it is of. */
  get source(): object | undefined {
    return this.#released ? undefined : this.#source;
  }

  /**
   * A new source is starting. Nothing learned about the last one carries
   * over, and neither does where its window put the playhead.
   */
  startSource() {
    if (this.#released) return;
    this.#source = {};
    this.#applied = undefined;
    this.#seenMainStream = false;
    if (!this.#sizesLiveWindow) return;
    // As throwable as every other `configure` here: a player whose
    // configuration has already gone — `load()` racing `destroy()` — throws
    // from it, and the caller has a core to tear down after this.
    try {
      this.#player.configure(
        "manifest.defaultPresentationDelay",
        INITIAL_LIVE_DELAY,
      );
    } catch (failure) {
      this.#debug(`could not reset the presentation delay: ${String(failure)}`);
    }
  }

  /**
   * Sizes the presentation delay from the window the core just parsed. The
   * manifest reaches the core before Shaka's parser sees the same bytes, so
   * the value is in place when Shaka builds its timeline — which is the one
   * moment it is read. A refresh reuses that timeline, so what is configured
   * here after the first manifest of a source is what the next load starts
   * from, not a change to the one playing. (The exception is a low-latency
   * DASH stream: Shaka re-applies the delay on every parse there, unless the
   * MPD suggests one of its own.)
   */
  sizeFrom(manifest: ProcessedManifest) {
    if (this.#released || !this.#sizesLiveWindow) return;

    // An HLS presentation arrives a manifest at a time — the master names the
    // variants and the audio renditions, then each media playlist comes on
    // its own — so a rendition's playlist describes a presentation with no
    // main stream in it, and the window it offers is the audio window. Once a
    // main stream has been seen, only a main stream sizes the placement; the
    // fallback to the widest stream is for a presentation that has no main
    // stream at all, and stops applying the moment one shows up.
    const hasMain = manifest.streams.some(
      (stream) =>
        stream.type === "main" && stream.isLive && stream.segmentCount,
    );
    if (this.#seenMainStream && !hasMain) return;
    this.#seenMainStream ||= hasMain;

    const target = liveDelayFor(manifest);
    if (!target) return;

    // Against the delay this applied, never against the one the player holds:
    // until a window is known that is INITIAL_LIVE_DELAY, and a first
    // window whose delay lands within half a segment of it would read as
    // already applied. Only when the window has changed by at least half a
    // segment: fractional drift is not a change worth carrying to the next
    // load.
    if (
      this.#applied !== undefined &&
      Math.abs(this.#applied - target.delay) < target.segment / 2
    ) {
      return;
    }

    this.#debug(`Setting defaultPresentationDelay to ${target.delay}`);
    // Written straight through: what to give back for this path was taken
    // when this binding was made, and reading the player for it would both
    // find this engine's own last value and rebuild the whole configuration,
    // which `getConfiguration` clones.
    this.#player.configure("manifest.defaultPresentationDelay", target.delay);
    this.#applied = target.delay;
  }

  /**
   * Gives the player back every setting this engine took, as it was — while
   * the player is still there to take them. A player being destroyed drops
   * its configuration, and Shaka's `configure` asserts it has one; the load
   * mode is what says so, since its networking engine outlives the
   * configuration by as long as the requests in flight take to settle.
   */
  release() {
    this.#released = true;
    const taken = [...this.#taken].reverse();
    this.#taken.clear();
    if (this.#player.getLoadMode() === this.#shaka.Player.LoadMode.DESTROYED) {
      return;
    }
    // Each on its own: `configure` merges and applies against the live
    // player, and one path failing must not leave the rest written. Giving
    // them back by halves is what leaves a player carrying this engine's
    // delay with nothing managing it, and a later binding reading that as the
    // integrator's own choice.
    const failures: unknown[] = [];
    for (const [path, value] of taken) {
      try {
        this.#player.configure(path, value);
      } catch (failure) {
        failures.push(failure);
      }
    }
    if (failures.length) throw failures[0];
  }
}
