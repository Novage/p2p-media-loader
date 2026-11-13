import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManifestClockSync } from "../src/manifest/clock-sync.js";
import type { UtcTimingSource } from "../src/manifest/types.js";

const LOCAL = Date.parse("2026-01-01T00:00:00Z");
/** The server's clock runs 30 s ahead of the local one. */
const AHEAD = 30_000;
const iso = (time: number) => new Date(time).toISOString();

const GET: UtcTimingSource = { method: "get", url: "https://time.example/" };
const HEAD: UtcTimingSource = { method: "head", url: "https://head.example/" };

/**
 * A server that answers after `delay` ms of local time with the time it read
 * halfway through, which is what a real server's answer amounts to.
 */
function server(answer: (time: number) => Response, delay = 200) {
  return vi.fn(() => {
    const time = Date.now() + delay / 2 + AHEAD;
    vi.setSystemTime(Date.now() + delay);
    return Promise.resolve(answer(time));
  });
}

describe("ManifestClockSync", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: LOCAL });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reads the time from the body of a get source, halfway through the request", async () => {
    const fetch = server((time) => new Response(`${iso(time)}\n`));
    vi.stubGlobal("fetch", fetch);
    const clock = new ManifestClockSync();

    expect(await clock.sync([GET])).toBe(true);

    expect(clock.now() - Date.now()).toBe(AHEAD);
    expect(fetch).toHaveBeenCalledWith(
      GET.url,
      expect.objectContaining({ method: "GET", credentials: "omit" }),
    );
  });

  it("reads a body time with no time zone and many fraction digits as UTC", async () => {
    vi.stubGlobal(
      "fetch",
      server((time) => new Response(`${iso(time).replace("Z", "")}456`), 0),
    );
    const clock = new ManifestClockSync();

    await clock.sync([GET]);

    expect(clock.now() - Date.now()).toBe(AHEAD);
  });

  it("reads the time from the Date header of a head source", async () => {
    vi.stubGlobal(
      "fetch",
      server(
        (time) =>
          new Response(null, {
            headers: { date: new Date(time).toUTCString() },
          }),
        0,
      ),
    );
    const clock = new ManifestClockSync();

    await clock.sync([HEAD]);

    // A Date header counts whole seconds.
    expect(clock.now() - Date.now()).toBe(AHEAD);
  });

  it("takes the time a direct source carries without a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const clock = new ManifestClockSync();

    await clock.sync([{ method: "direct", time: LOCAL + AHEAD }]);

    expect(clock.now() - Date.now()).toBe(AHEAD);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("goes on to the next source when one fails, answers badly or with no time", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("not a date"))
      .mockResolvedValueOnce(new Response(iso(LOCAL + AHEAD)));
    vi.stubGlobal("fetch", fetch);
    const clock = new ManifestClockSync();

    expect(await clock.sync([GET, GET, GET, GET])).toBe(true);

    expect(fetch).toHaveBeenCalledTimes(4);
    expect(clock.now() - Date.now()).toBe(AHEAD);
  });

  it("measures a direct time from when the manifest arrived, not after the sources before it", async () => {
    // The first source never answers, so the direct source is reached only
    // after its 5 s timeout.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => undefined)),
    );
    const clock = new ManifestClockSync();

    const synced = clock.sync([GET, { method: "direct", time: LOCAL + AHEAD }]);
    await vi.advanceTimersByTimeAsync(5000);

    expect(await synced).toBe(true);
    expect(clock.now() - Date.now()).toBe(AHEAD);
  });

  it("goes on to the next source when one does not answer in time", async () => {
    const fetch = vi
      .fn()
      .mockReturnValueOnce(new Promise(() => undefined))
      .mockResolvedValueOnce(new Response(iso(LOCAL + AHEAD + 5000)));
    vi.stubGlobal("fetch", fetch);
    const clock = new ManifestClockSync();

    const synced = clock.sync([GET, GET]);
    await vi.advanceTimersByTimeAsync(5000);

    expect(await synced).toBe(true);
    expect(clock.now() - Date.now()).toBe(AHEAD);
  });

  it("keeps the local clock when no source answers, and tries again a minute later", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("network"));
    vi.stubGlobal("fetch", fetch);
    const clock = new ManifestClockSync();

    expect(await clock.sync([GET])).toBe(false);
    expect(clock.now()).toBe(Date.now());

    await clock.sync([GET]);
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 60_000);
    await clock.sync([GET]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("synchronizes once", async () => {
    const fetch = server((time) => new Response(iso(time)));
    vi.stubGlobal("fetch", fetch);
    const clock = new ManifestClockSync();

    await clock.sync([GET]);
    expect(await clock.sync([GET])).toBe(false);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("forgets the offset on reset, and ignores an answer that arrives after it", async () => {
    let answer: (response: Response) => void = () => undefined;
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        signal = init.signal ?? undefined;
        return new Promise<Response>((resolve) => (answer = resolve));
      }),
    );
    const clock = new ManifestClockSync();

    const synced = clock.sync([GET]);
    clock.reset();
    answer(new Response(iso(LOCAL + AHEAD)));

    expect(await synced).toBe(false);
    expect(signal?.aborted).toBe(true);
    expect(clock.now()).toBe(Date.now());
  });
});
