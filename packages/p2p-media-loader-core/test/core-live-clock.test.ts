import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Core } from "../src/core.js";
import { liveDelayFor } from "../src/live-delay.js";
import { dashManifestParser } from "../src/manifest/dash.js";
import { hlsManifestParser } from "../src/manifest/hls.js";
import {
  initializeSegmentStorage,
  recordingStorage,
} from "./recording-storage.js";
import {
  DASH_LIVE_START,
  DASH_SEGMENT_TIMELINE_DYNAMIC,
  DASH_TEMPLATE_DURATION_DYNAMIC,
  HLS_LIVE_NO_PDT_REFRESH_1,
} from "./fixtures/index.js";

const MPD_URL = "https://cdn.example/dash/manifest.mpd";
const video = (number: number) =>
  `https://cdn.example/dash/V1200/${number}.m4s`;
const audio = (number: number) => `https://cdn.example/dash/A48/${number}.m4s`;

/** A time server whose clock runs `ahead` ms ahead of the local one. */
function timeServer(ahead = 0) {
  return vi.fn(() =>
    Promise.resolve(new Response(new Date(Date.now() + ahead).toISOString())),
  );
}

/**
 * The core lists segments for a moment half a second in the past, which keeps
 * its requests after an origin whose clock runs a little behind.
 */
const MARGIN = 500;

/**
 * A core on the clock-based live fixture, listing for 100 s after its
 * availability start: segments 5 to 11 are listed, 12 ends at 104 s, and 5
 * leaves at 108 s. The parser is spied on, so a parse the core makes by
 * itself is seen.
 */
async function clockCore() {
  const { storage, removed } = recordingStorage();
  const parser = {
    ...dashManifestParser,
    parse: vi.fn(dashManifestParser.parse),
  };
  const core = new Core({
    manifestParsers: [parser],
    customSegmentStorageFactory: () => storage,
  });
  core.processManifest({ url: MPD_URL, data: DASH_TEMPLATE_DURATION_DYNAMIC });
  await initializeSegmentStorage(core);
  // Let the clock synchronization finish before a test moves the time: a
  // jump while the time request is under way would count as its round trip.
  await vi.advanceTimersByTimeAsync(0);
  return { core, parse: parser.parse, removed };
}

describe("Core on a segment list computed from the clock", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: DASH_LIVE_START + 100_000 + MARGIN });
    vi.stubGlobal("fetch", timeServer());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("lists a segment once it becomes available, with no new manifest", async () => {
    const { core, parse } = await clockCore();
    expect(core.hasSegment(video(11))).toBe(true);
    const parses = parse.mock.calls.length;

    // Segment 12 ends at 104 s; the core parses again just after it, plus
    // the margin.
    await vi.advanceTimersByTimeAsync(4100);

    expect(parse.mock.calls.length).toBe(parses + 1);
    expect(core.hasSegment(video(12))).toBe(true);
    core.destroy();
  });

  it("holds its own parse back by the margin", async () => {
    const { core } = await clockCore();

    // 104.4 s: segment 12 ended less than the margin ago.
    await vi.advanceTimersByTimeAsync(3900);
    expect(core.hasSegment(video(12))).toBe(false);

    await vi.advanceTimersByTimeAsync(200);
    expect(core.hasSegment(video(12))).toBe(true);
    core.destroy();
  });

  it("tells the storage which segments left the window as time passed", async () => {
    const { core, removed } = await clockCore();

    // Segment 5, from 40 s, leaves at 108 s, in the video and the audio
    // stream alike.
    await vi.advanceTimersByTimeAsync(8100);

    expect(removed).toEqual([[400], [400]]);
    expect(core.hasSegment(video(5))).toBe(false);
    core.destroy();
  });

  it("lists a segment the player asks for as soon as it exists, and keeps it", async () => {
    const { core } = await clockCore();
    const misses: string[] = [];
    core.addEventListener("onSegmentRegistryMiss", ({ url }) =>
      misses.push(url),
    );

    // Segment 12 ended 300 ms ago, inside the margin, and the player, on its
    // own clock, asks for it.
    vi.setSystemTime(DASH_LIVE_START + 104_300);
    core.isSegmentLoadable(video(12));

    expect(misses).toEqual([]);
    expect(core.hasSegment(video(12))).toBe(true);

    // The parse the core makes by itself, later, does not take it back.
    await vi.advanceTimersByTimeAsync(1000);
    expect(core.hasSegment(video(12))).toBe(true);
    core.destroy();
  });

  it("answers a request just after a boundary, though one just before it missed", async () => {
    const { core } = await clockCore();
    const misses: string[] = [];
    core.addEventListener("onSegmentRegistryMiss", ({ url }) =>
      misses.push(url),
    );

    // Segment 12 ends at 104 s. The player's clock runs a little ahead.
    vi.setSystemTime(DASH_LIVE_START + 103_970);
    core.isSegmentLoadable(video(12));
    vi.setSystemTime(DASH_LIVE_START + 104_020);
    core.isSegmentLoadable(audio(12));

    expect(misses).toEqual([video(12)]);
    expect(core.hasSegment(audio(12))).toBe(true);
    core.destroy();
  });

  it("parses for misses at most once per boundary", async () => {
    const { core, parse } = await clockCore();
    const unknown = "https://cdn.example/dash/text/1.vtt";
    const parses = parse.mock.calls.length;

    // Before segment 12 ends, a parse would list nothing new.
    vi.setSystemTime(DASH_LIVE_START + 102_000);
    for (let i = 0; i < 5; i++) core.isSegmentLoadable(unknown);
    expect(parse.mock.calls.length).toBe(parses);

    // After it ends, the first miss parses; the list's next change is then
    // a boundary ahead, so the misses after it do not.
    vi.setSystemTime(DASH_LIVE_START + 104_020);
    for (let i = 0; i < 5; i++) core.isSegmentLoadable(unknown);
    expect(parse.mock.calls.length).toBe(parses + 1);
    core.destroy();
  });

  it("reports a request for a segment that does not exist yet as a miss", async () => {
    const { core } = await clockCore();
    const misses: string[] = [];
    core.addEventListener("onSegmentRegistryMiss", ({ url }) =>
      misses.push(url),
    );

    core.isSegmentLoadable(video(12));

    expect(misses).toEqual([video(12)]);
    core.destroy();
  });

  it("computes the list on the time server's clock", async () => {
    vi.stubGlobal("fetch", timeServer(30_000));
    const { core } = await clockCore();

    // At 130 s on the server's clock, segment 15 has ended, and the window
    // starts at segment 8, from 64 s: 5 to 7 have left.
    await vi.advanceTimersByTimeAsync(1);

    expect(core.hasSegment(video(15))).toBe(true);
    expect(core.hasSegment(video(7))).toBe(false);
    core.destroy();
  });

  it("tries a failed scheduled parse again a second later", async () => {
    const { core, parse } = await clockCore();
    parse.mockImplementationOnce(() => {
      throw new Error("a parse that fails once");
    });

    // The parse just after segment 12 ends fails, and lists nothing.
    await vi.advanceTimersByTimeAsync(4100);
    expect(core.hasSegment(video(12))).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    expect(core.hasSegment(video(12))).toBe(true);
    core.destroy();
  });

  it("lets go of the live MPD once a static one replaces it from another URL", async () => {
    const { core, parse } = await clockCore();

    // The event ends at 104 s, and a redirect serves the last MPD from
    // another host.
    core.processManifest({
      url: "https://edge2.example/dash/manifest.mpd",
      data: DASH_TEMPLATE_DURATION_DYNAMIC.replace(
        'type="dynamic"',
        'type="static" mediaPresentationDuration="PT104S"',
      ),
    });
    const parses = parse.mock.calls.length;

    await vi.advanceTimersByTimeAsync(20_000);

    // No parse of the live MPD lists segments past the end.
    expect(parse.mock.calls.length).toBe(parses);
    expect(core.hasSegment(video(14))).toBe(false);
    core.destroy();
  });

  it("compares a direct time with when its MPD arrived, when a later parse makes the sync", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    const core = new Core({ manifestParsers: [dashManifestParser] });

    // The first MPD names only HTTP time servers, and none answers.
    core.processManifest({
      url: MPD_URL,
      data: DASH_TEMPLATE_DURATION_DYNAMIC.replace(
        /\s*<UTCTiming schemeIdUri="urn:mpeg:dash:utc:direct:2014"[^>]*\/>/,
        "",
      ),
    });
    await vi.advanceTimersByTimeAsync(30_000);

    // Within the minute before a retry, a refresh adds the time itself, 30 s
    // ahead of the local clock. The retry comes from a parse of that MPD,
    // seconds after it arrived.
    const arrived = Date.now();
    core.processManifest({
      url: MPD_URL,
      data: DASH_TEMPLATE_DURATION_DYNAMIC.replace(
        'value="2026-01-01T00:10:00Z"',
        `value="${new Date(arrived + 30_000).toISOString()}"`,
      ),
    });
    await vi.advanceTimersByTimeAsync(40_000);

    const { clockSync } = (
      core as unknown as {
        clockedManifest: { clockSync: { now(): number } };
      }
    ).clockedManifest;
    expect(clockSync.now() - Date.now()).toBe(30_000);
    core.destroy();
  });

  it("waits longer after each failure that repeats, and resets once a parse succeeds", async () => {
    const { core, parse } = await clockCore();
    const fail = () => {
      throw new Error("a parse that keeps failing");
    };
    parse.mockImplementation(fail);
    const parses = parse.mock.calls.length;

    // Tries at 104.55 s, then 1, 2, 4, 8, 16 and 32 s later: seven in two
    // minutes, not one a second.
    await vi.advanceTimersByTimeAsync(124_100);
    expect(parse.mock.calls.length - parses).toBe(7);

    // The wait stops growing at a minute: the next try is at 227.55 s, and
    // it succeeds.
    parse.mockImplementation(dashManifestParser.parse);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(parse.mock.calls.length - parses).toBe(8);
    expect(core.hasSegment(video(27))).toBe(true);

    // After a success, a new failure is tried again a second later.
    parse.mockImplementation(fail);
    const before = parse.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(parse.mock.calls.length - before).toBe(2);
    core.destroy();
  });

  it("makes no parse for a miss while a failed parse waits for its retry", async () => {
    const { core, parse } = await clockCore();
    parse.mockImplementation(() => {
      throw new Error("a parse that keeps failing");
    });

    // The parse just after segment 12 ends fails, and every parse after it
    // would fail too: the misses make none.
    await vi.advanceTimersByTimeAsync(4100);
    const parses = parse.mock.calls.length;
    for (let i = 0; i < 5; i++) core.isSegmentLoadable(video(12));
    expect(parse.mock.calls.length).toBe(parses);

    // The retry a second later is the next try; it succeeds, and lists the
    // segment.
    parse.mockImplementation(dashManifestParser.parse);
    await vi.advanceTimersByTimeAsync(1000);
    expect(parse.mock.calls.length).toBe(parses + 1);
    expect(core.hasSegment(video(12))).toBe(true);
    core.destroy();
  });

  it("reports one live placement, whatever the moment the MPD was processed", () => {
    // Processed at 100 s the fixture lists 7 segments, at 104.5 s 8; a peer's
    // placement must not depend on which.
    const delays = [100_000, 104_500].map((ms) => {
      vi.setSystemTime(DASH_LIVE_START + ms + MARGIN);
      const core = new Core({ manifestParsers: [dashManifestParser] });
      const processed = core.processManifest({
        url: MPD_URL,
        data: DASH_TEMPLATE_DURATION_DYNAMIC,
      });
      core.destroy();
      return liveDelayFor(processed!)?.delay;
    });
    expect(delays).toEqual([52, 52]);
  });

  it("stops parsing once destroyed", async () => {
    const { core, parse } = await clockCore();
    core.destroy();
    const parses = parse.mock.calls.length;

    await vi.advanceTimersByTimeAsync(30_000);

    expect(parse.mock.calls.length).toBe(parses);
  });

  it("makes no time request and arms no timer for a list that does not follow the clock", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const core = new Core({
      manifestParsers: [dashManifestParser, hlsManifestParser],
    });

    core.processManifest({ url: MPD_URL, data: DASH_SEGMENT_TIMELINE_DYNAMIC });
    core.processManifest({
      url: "https://cdn.example/live/index.m3u8",
      data: HLS_LIVE_NO_PDT_REFRESH_1,
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    core.destroy();
  });
});
