import debug from "debug";
import type { ManifestClock, ManifestParser } from "./types.js";
import { ManifestClockSync } from "./clock-sync.js";
import { diagnostics, type DiagnosticsToken } from "../diagnostics.js";

/**
 * How far in the past the core computes a clock-based segment list by itself.
 * Time servers disagree by tens of milliseconds and more, a synchronization
 * over a new connection overestimates the offset by part of the handshake,
 * and an origin refuses a request for a segment that is not yet available on
 * its own clock (livesim2 answers 425 Too Early, others 404). A segment the
 * core lists, an elected peer fetches at once; listing it this long after it
 * became available keeps that fetch after the origin's clock. A player's own
 * request is not held to the margin: see `reparseForMiss`.
 */
const AVAILABILITY_MARGIN_MS = 500;
/**
 * How long after a clock-based list changes the core parses it again: a
 * margin over the instant itself, so the parse lands after the change.
 */
const CLOCK_CHANGE_MARGIN_MS = 50;
/** The least time between two scheduled parses of a clock-based list. */
const MIN_CLOCK_REEVALUATION_MS = 250;
/**
 * How soon a scheduled parse that failed is tried again, the first time. Its
 * list's next change has passed, so the usual schedule would retry at the
 * least interval, four times a second, for as long as the failure lasts.
 * Each failure after it doubles the wait, up to `MAX_CLOCK_RETRY_MS`: a
 * failure that repeats for the same text costs a full parse of a possibly
 * large MPD each time, and an MPD the player never refreshes would pay it for
 * the whole session.
 */
const CLOCK_RETRY_MS = 1000;
/** The longest wait between two tries of a parse that keeps failing. */
const MAX_CLOCK_RETRY_MS = 60_000;

/** A fetched manifest and the parser that reads it. */
export type ManifestSource = {
  readonly parser: ManifestParser;
  readonly text: string;
  readonly url: string;
  readonly requestedUrl?: string;
  /**
   * When the manifest arrived, on the local clock: the moment a `direct`
   * time it carries was true. A parse of the kept text keeps it.
   */
  readonly receivedAt: number;
};

/** The kept manifest, with when its segment list next changes. */
type KeptManifest = ManifestSource & { readonly nextChangeAt?: number };

/**
 * The presentation's manifest when its segment list follows from the clock,
 * kept and parsed again as time passes. It decides when to parse and for
 * which moment; the core parses and applies, as it does any manifest. See
 * specs/manifest-registry.md, "Segments computed from the clock".
 *
 * A core plays one presentation, and an MPD that moves to another URL is still
 * the one MPD, so only the latest such manifest is kept, and the next one its
 * parser reads replaces it.
 */
export class ClockedManifest {
  private readonly clockSync = new ManifestClockSync();
  private kept?: KeptManifest;
  private timer?: ReturnType<typeof setTimeout>;
  /**
   * The latest moment a list was computed for. The listing time never goes
   * back from it, so no parse takes back a segment an earlier one listed —
   * until the clock itself is corrected.
   */
  private listedUntil = -Infinity;
  /** How long the next try of a failed parse waits; see `CLOCK_RETRY_MS`. */
  private retryDelay = CLOCK_RETRY_MS;
  private readonly logger = debug("p2pml-core:clock");
  private timerToken?: DiagnosticsToken;
  private keptToken?: DiagnosticsToken;

  /**
   * @param reparse - Parses a kept manifest for `now` and applies it, as the
   * core does any manifest, and reports a parse that succeeds through
   * `track`. Returns `false` when the parse failed.
   */
  constructor(
    private readonly reparse: (source: ManifestSource, now: number) => boolean,
  ) {}

  /**
   * The moment a segment list is computed for: the present on the
   * synchronized clock, less the margin that keeps the core's own requests
   * after the origin's clock — or with no margin, where a player's request
   * prompted the parse. Never earlier than the last list.
   */
  listingTime(promptedByPlayer = false): number {
    const margin = promptedByPlayer ? 0 : AVAILABILITY_MARGIN_MS;
    this.listedUntil = Math.max(
      this.listedUntil,
      this.clockSync.now() - margin,
    );
    return this.listedUntil;
  }

  /**
   * Takes in a manifest that parsed. One whose segment list follows from the
   * clock is kept, the clock is synchronized with the time sources it names,
   * and the next parse is scheduled for when the list next changes. Between
   * the player's refreshes of such a manifest the core would otherwise know no
   * segment that became available since the last one — and a player that asks
   * for a segment the moment it exists asks for exactly those.
   */
  track(source: ManifestSource, clock: ManifestClock | undefined): void {
    this.retryDelay = CLOCK_RETRY_MS;
    if (!clock) {
      // The presentation's manifest, no longer computed from the clock: a
      // live event that ended, for one. Known by its parser, not its URL — a
      // redirect or an MPD `Location` brings the last one from another URL,
      // and the live one kept would go on listing segments that never come.
      this.release(source, "ended");
      return;
    }
    this.kept = { ...source, nextChangeAt: clock.nextChangeAt };
    this.keptToken ??= diagnostics?.open("ClockedManifestKept", source.url);
    this.schedule();
    this.clockSync
      .sync(clock.utcTiming, source.receivedAt)
      .then((moved) => {
        if (!moved) return;
        // The list was computed on the clock as it stood. Computed again on
        // the corrected one, from the start: a clock that moved back lists
        // fewer segments, and those it listed early do not exist yet.
        // They are reported to the storage as removed, like segments that
        // left the window: the storage drops them, and the core fetches them
        // again when they become available. Data is dropped only from an
        // origin that serves a segment before it is available: the player
        // asks for a segment only once its own synchronized clock says it
        // exists, and at any other origin an elected peer's early request
        // fails.
        this.listedUntil = -Infinity;
        this.reevaluate();
      })
      .catch((error: unknown) => {
        this.logger("clock synchronization failed: %O", error);
      });
  }

  /**
   * Takes in a manifest the player fetched that failed to parse. The kept one
   * is let go, as for one with no clock: the player has replaced it with a
   * manifest the core cannot read, and the kept one would go on listing
   * segments the player may no longer ask for. A live event that ended can
   * serve a static MPD too large to parse — livesim2's lists every segment
   * since 1970. The registry keeps what it listed, and the next manifest that
   * parses is kept again, so one bad response stops the list only until the
   * player's next refresh.
   */
  failed(source: ManifestSource): void {
    this.release(source, "failed");
  }

  /** Lets go of the kept manifest, where `source` is from its parser. */
  private release(source: ManifestSource, cause: string): void {
    if (this.kept?.parser !== source.parser) return;
    this.kept = undefined;
    diagnostics?.close(this.keptToken, cause);
    this.keptToken = undefined;
    this.schedule();
  }

  /**
   * Answers a registry miss with a parse for the present, where one can list
   * something new. The player keeps its own clock, synchronized with the same
   * time source, and asks for a segment the moment that clock says it exists
   * — which can be before the scheduled parse, held back by its margin, has
   * listed it. The request is the player's word that the segment exists, so
   * this parse has no margin.
   *
   * The parse is made only once the present has reached the list's next
   * change: before it, a parse lists nothing new. So a request a moment before
   * a boundary does not keep one a moment after it from being answered, and a
   * run of misses for URLs no manifest lists costs at most a parse per
   * boundary.
   *
   * While a failed parse waits for its retry, a miss makes no parse. The list
   * then stays as it was and its next change stays in the past, so each miss
   * would make a parse that fails again, in the player's request path; the
   * retry and its backoff are the only tries.
   *
   * @returns Whether it parsed.
   */
  reparseForMiss(): boolean {
    const nextChangeAt = this.kept?.nextChangeAt;
    if (
      nextChangeAt === undefined ||
      this.clockSync.now() < nextChangeAt ||
      this.parseFailing
    ) {
      return false;
    }
    diagnostics?.count("ClockReparse:prompted");
    this.reevaluate(true);
    return true;
  }

  /** Forgets the kept manifest and the clock, for the next source. */
  reset(): void {
    this.clockSync.reset();
    this.kept = undefined;
    if (this.keptToken) diagnostics?.close(this.keptToken, "reset");
    this.keptToken = undefined;
    // With no manifest kept, this only disarms the timer.
    this.schedule();
    this.listedUntil = -Infinity;
    this.retryDelay = CLOCK_RETRY_MS;
  }

  /**
   * Whether the last parse of the kept manifest failed, so a retry is
   * pending: a failure grows the wait past the first one, and a success sets
   * it back.
   */
  private get parseFailing(): boolean {
    return this.retryDelay > CLOCK_RETRY_MS;
  }

  /** Arms the one timer for the next change of the kept list. */
  private schedule(retryDelay?: number): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.timerToken) diagnostics?.close(this.timerToken, "cleared");
    this.timerToken = undefined;
    const nextChangeAt = this.kept?.nextChangeAt;
    if (nextChangeAt === undefined) return;
    const delay =
      retryDelay ??
      Math.max(
        MIN_CLOCK_REEVALUATION_MS,
        nextChangeAt -
          (this.clockSync.now() - AVAILABILITY_MARGIN_MS) +
          CLOCK_CHANGE_MARGIN_MS,
      );
    this.timerToken = diagnostics?.open("ClockTimer", String(delay));
    this.timer = setTimeout(() => {
      this.timer = undefined;
      diagnostics?.close(this.timerToken, "fired");
      this.timerToken = undefined;
      diagnostics?.count(
        retryDelay === undefined
          ? "ClockReparse:scheduled"
          : "ClockReparse:retry",
      );
      this.reevaluate();
    }, delay);
  }

  /**
   * Parses the kept manifest again for the present, as though the player had
   * fetched it again. The registry diffs the result like any refresh: segments
   * that became available are added, and those that left the window are
   * removed.
   */
  private reevaluate(promptedByPlayer = false): void {
    const manifest = this.kept;
    if (!manifest) return;
    if (this.reparse(manifest, this.listingTime(promptedByPlayer))) return;
    diagnostics?.count("ClockReparse:failed");
    // A failed parse leaves the kept list as it was, and arms nothing; an MPD
    // the player never refreshes would otherwise stop here for good.
    this.schedule(this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, MAX_CLOCK_RETRY_MS);
  }
}
