import debug from "debug";
import type { UtcTimingSource } from "./types.js";
import { parseUtcTime } from "./utc-time.js";
import { diagnostics } from "../diagnostics.js";
import { isAbortControllerSupported } from "../utils/abort-controller.js";

/** How long one time server has to answer before the next one is tried. */
const REQUEST_TIMEOUT_MS = 5000;
/** How soon a synchronization that found no time is tried again. */
const RETRY_INTERVAL_MS = 60_000;

/**
 * The clock the core computes clock-based segment lists with: the local clock,
 * corrected by the offset to the time server a manifest names. A DASH player
 * synchronizes with the MPD's `UTCTiming` before it computes which segments
 * exist; the core must reach the same answer, or it lists segments the player
 * will not ask for yet — and an elected peer fetches them early, into a 404 —
 * or does not list the ones it does ask for. See specs/manifest-registry.md,
 * "Segments computed from the clock".
 *
 * Synchronizes once per source. Where the manifest names no usable source or
 * every one fails, the local clock stands, and a failure is retried at most
 * once a minute.
 */
export class ManifestClockSync {
  private offset = 0;
  private synced = false;
  private attemptedAt?: number;
  /** Moves on at `reset`, so a synchronization that outlived it changes nothing. */
  private generation = 0;
  private controller?: AbortController;
  private readonly logger = debug("p2pml-core:clock");

  /** The present on the synchronized clock, in epoch milliseconds. */
  now(): number {
    return Date.now() + this.offset;
  }

  /**
   * Synchronizes with the first source that answers, in the manifest's order
   * of preference, unless the clock is synchronized already or the last
   * attempt started less than a minute ago — which also covers one under way.
   *
   * @param receivedAt - When the manifest that names the sources arrived, on
   * the local clock: a `direct` time is compared with it. An attempt can come
   * later than that, from a parse of a kept manifest, and a `direct` time
   * compared with the present would be off by the manifest's age.
   * @returns Whether the clock moved.
   */
  async sync(
    sources: readonly UtcTimingSource[],
    receivedAt = Date.now(),
  ): Promise<boolean> {
    if (this.synced) return false;
    if (
      this.attemptedAt !== undefined &&
      Date.now() - this.attemptedAt < RETRY_INTERVAL_MS
    ) {
      return false;
    }
    this.attemptedAt = Date.now();
    if (!sources.length) {
      this.logger("the manifest names no usable time source; local clock");
      return false;
    }

    const { generation } = this;
    for (const source of sources) {
      const offset = await this.offsetFrom(source, receivedAt);
      if (generation !== this.generation) return false;
      if (offset === undefined) continue;
      this.offset = offset;
      this.synced = true;
      diagnostics?.count("ClockSync:synced");
      this.logger(
        "synchronized with %s: %d ms from the local clock",
        source.method === "direct" ? "the manifest" : source.url,
        Math.round(offset),
      );
      return offset !== 0;
    }
    this.logger("no time source answered; local clock");
    diagnostics?.count("ClockSync:failed");
    return false;
  }

  /** Forgets the offset and abandons a synchronization under way. */
  reset(): void {
    this.generation++;
    this.controller?.abort();
    this.controller = undefined;
    this.offset = 0;
    this.synced = false;
    this.attemptedAt = undefined;
  }

  /**
   * The offset one source gives, or `undefined` when it gives none. An HTTP
   * answer is taken as the time halfway through the request, which halves
   * the error the round trip adds. A `direct` time is compared with the
   * moment the manifest arrived, not with the moment the loop reaches it:
   * sources before it can fail only after their timeout, and that wait would
   * set the clock back by as much.
   */
  private async offsetFrom(
    source: UtcTimingSource,
    receivedAt: number,
  ): Promise<number | undefined> {
    if (source.method === "direct") return source.time - receivedAt;

    const controller = isAbortControllerSupported
      ? new AbortController()
      : undefined;
    this.controller = controller;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const requestToken = diagnostics?.open("ClockSyncRequest", source.url);
    try {
      const sent = Date.now();
      const time = await Promise.race([
        this.requestTime(source, controller?.signal),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller?.abort();
            reject(new Error("timed out"));
          }, REQUEST_TIMEOUT_MS);
        }),
      ]);
      const received = Date.now();
      if (Number.isNaN(time)) {
        this.logger("%s answered with no time", source.url);
        return undefined;
      }
      return time - (sent + received) / 2;
    } catch (error) {
      this.logger("%s failed: %O", source.url, error);
      return undefined;
    } finally {
      clearTimeout(timeout);
      if (this.controller === controller) this.controller = undefined;
      diagnostics?.close(requestToken, "settled");
    }
  }

  /**
   * The time a server gives, in epoch milliseconds; `NaN` when its answer
   * holds none. Cross-origin, a `Date` header is readable only where the
   * server exposes it, which a `head` source's server must.
   */
  private async requestTime(
    source: Extract<UtcTimingSource, { method: "get" | "head" }>,
    signal: AbortSignal | undefined,
  ): Promise<number> {
    const response = await fetch(source.url, {
      method: source.method === "head" ? "HEAD" : "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      signal,
    });
    if (!response.ok) return NaN;
    if (source.method === "head") {
      // An HTTP date, which every engine reads alike.
      return Date.parse(response.headers.get("date") ?? "");
    }
    return parseUtcTime(await response.text());
  }
}
