import { describe, expect, it } from "vitest";
import { dashManifestParser } from "../src/manifest/dash.js";
import { ManifestRegistry } from "../src/manifest/registry.js";
import { computeStreamIdentityHash } from "../src/index.js";
import {
  ANGEL_ONE_MPD_URL,
  BBB_MPD_URL,
  DASH_DYNAMIC_WITH_TRICK_MODE,
  DASH_LIVE_START,
  DASH_OPEN_TIMELINE_MIXED,
  DASH_MULTI_PERIOD,
  DASH_SEGMENT_BASE,
  DASH_SEGMENT_BASE_LIVE,
  DASH_SEGMENT_TEMPLATE,
  DASH_SEGMENT_TIMELINE_DYNAMIC,
  DASH_SEGMENT_TIMELINE_OPEN,
  DASH_TEMPLATE_DURATION_DYNAMIC,
  DASH_WITH_TEXT_IMAGE_AND_TRICK_MODE,
  readFixture,
} from "./fixtures/index.js";

const URL = "https://cdn.example/dash/manifest.mpd";

describe("dashManifestParser", () => {
  it("sniffs the protocol", () => {
    expect(dashManifestParser.canParse(DASH_SEGMENT_TEMPLATE)).toBe(true);
    expect(dashManifestParser.canParse("#EXTM3U")).toBe(false);
  });

  it("emits video and audio streams from a SegmentTemplate MPD", () => {
    const parsed = dashManifestParser.parse(DASH_SEGMENT_TEMPLATE, URL);
    const [video, audio] = parsed.streams;

    expect(video).toMatchObject({
      key: "video-720p",
      type: "main",
      isLive: false,
      indexSource: { kind: "manifest" },
      initSegments: [{ url: "https://cdn.example/dash/v720-init.mp4" }],
    });
    expect(video.properties).toMatchObject({
      bitrate: 1000000,
      codecs: "avc1.4d401f",
      width: 1280,
      height: 720,
    });
    expect(video.properties.frameRate).toBeCloseTo(29.97, 2);

    expect(audio).toMatchObject({
      key: "audio-en",
      type: "secondary",
      properties: {
        bitrate: 0,
        codecs: "mp4a.40.2",
        language: "en",
        // Representation id, not the label: the stable manifest-given name.
        name: "audio-en",
      },
    });
  });

  it("reads the channel count mpd-parser drops", () => {
    const [, audio] = dashManifestParser.parse(
      DASH_SEGMENT_TEMPLATE,
      URL,
    ).streams;
    expect(audio.properties.channels).toBe(2);
  });

  it("gives every segment a presentation time and an absolute URL", () => {
    const [video] = dashManifestParser.parse(
      DASH_SEGMENT_TEMPLATE,
      URL,
    ).streams;
    expect(video.segments?.map((s) => s.presentationTime)).toEqual([
      0, 6, 12, 18, 24, 30, 36,
    ]);
    // $Number$ honours startNumber; `sequence` is only the parse index.
    expect(video.segments?.[0]).toMatchObject({
      url: "https://cdn.example/dash/v720-7.m4s",
      sequence: 0,
      duration: 6,
    });
  });

  it("reads presentation time off a SegmentTimeline and live off type=dynamic", () => {
    const [video] = dashManifestParser.parse(
      DASH_SEGMENT_TIMELINE_DYNAMIC,
      URL,
    ).streams;
    expect(video.isLive).toBe(true);
    expect(video.segments?.map((s) => s.presentationTime)).toEqual([
      120, 124, 128, 132,
    ]);
    expect(video.segments?.map((s) => s.duration)).toEqual([4, 4, 4, 3.5]);
  });

  it("keeps presentation time global across periods", () => {
    // Identity must not restart at a period boundary; see segment-identity.md.
    const [video] = dashManifestParser.parse(DASH_MULTI_PERIOD, URL).streams;
    expect(video.segments?.map((s) => s.presentationTime)).toEqual([
      0, 10, 20, 30,
    ]);
    expect(video.segments?.map((s) => s.url.split("/").pop())).toEqual([
      "p0-1.m4s",
      "p0-2.m4s",
      "p1-1.m4s",
      "p1-2.m4s",
    ]);
  });

  it("reads live off the MPD however far into the document its tag sits", () => {
    // A comment header, a long list of namespaces, a profile URN: the
    // opening tag is not guaranteed to be near the start of the file.
    const padded = DASH_SEGMENT_TIMELINE_DYNAMIC.replace(
      "<MPD ",
      `<!--${"x".repeat(5000)}-->\n<MPD `,
    );
    const [video] = dashManifestParser.parse(padded, URL).streams;
    expect(video.isLive).toBe(true);
  });

  it("records the initialization segment of every period it spans", () => {
    const [video] = dashManifestParser.parse(DASH_MULTI_PERIOD, URL).streams;
    expect(video.initSegments?.map((i) => i.url)).toEqual([
      "https://cdn.example/dash/p0-init.mp4",
      "https://cdn.example/dash/p1-init.mp4",
    ]);
  });

  it("takes the period start from the playlist when the index carries none", () => {
    // A DASH segment's external ID is its presentation time, so a period
    // start read as 0 shifts every segment of the period on the wire.
    const [video] = dashManifestParser.parse(
      DASH_SEGMENT_BASE_LIVE,
      URL,
    ).streams;
    expect(video.indexSource).toEqual({
      kind: "external",
      url: "https://cdn.example/dash/video.mp4",
      byteRange: { start: 700, end: 1500 },
      periodStart: 30,
    });
  });

  it("emits video and audio streams only: no text, no thumbnails, no trick play", () => {
    const parsed = dashManifestParser.parse(
      DASH_WITH_TEXT_IMAGE_AND_TRICK_MODE,
      URL,
    );
    expect(parsed.streams.map((s) => [s.key, s.type])).toEqual([
      ["video-720p", "main"],
      ["audio-en", "secondary"],
    ]);
    // An MPD is one document; nothing arrives later to be ignored.
    expect(parsed.excludedPlaylists).toBeUndefined();
  });

  it("identifies a rung without bitrate once the trick-mode set that matched it is gone", () => {
    // The trick-mode Representation shares codecs and resolution with the
    // 720p rung. Counted as a stream it would have forced bitrate into the
    // rung's identity; left out, the rung hashes without it — the derivation
    // every 5.0.0 peer must make, whichever packager wrote the MPD.
    const registry = new ManifestRegistry();
    registry.apply(
      dashManifestParser.parse(DASH_WITH_TEXT_IMAGE_AND_TRICK_MODE, URL),
    );
    const rung = registry.getStream("video-720p")!;
    expect(rung.identityHash).toBe(
      computeStreamIdentityHash({ ...rung.properties, bitrate: undefined }),
    );
  });

  it("leaves a trick-mode set out of a live presentation too", () => {
    const parsed = dashManifestParser.parse(DASH_DYNAMIC_WITH_TRICK_MODE, URL);
    expect(parsed.streams.map((s) => s.key)).toEqual(["v"]);
    expect(parsed.streams[0].isLive).toBe(true);
  });

  it("registers no text stream from a real MPD with subtitle sets", () => {
    const text = readFixture("angel-one.mpd");
    const parsed = dashManifestParser.parse(text, ANGEL_ONE_MPD_URL);
    const textIds = Array.from(
      text.matchAll(/contentType="text"[^]*?<Representation id="(\d+)"/g),
      (m) => m[1],
    );
    expect(textIds).toHaveLength(4);

    const keys = parsed.streams.map((s) => s.key);
    for (const id of textIds) expect(keys).not.toContain(id);
    // Every other Representation, and nothing else.
    const representations = text.match(/<Representation /g)?.length ?? 0;
    expect(parsed.streams).toHaveLength(representations - textIds.length);
    expect(parsed.streams.some((s) => s.type === "main")).toBe(true);
    expect(parsed.streams.some((s) => s.type === "secondary")).toBe(true);
  });

  it("reports SegmentBase as an external index and says nothing of segments", () => {
    const [video] = dashManifestParser.parse(DASH_SEGMENT_BASE, URL).streams;
    // Not an empty list: that would be read as "these are all there are" and
    // take away what the index gave, on every refresh.
    expect(video.segments).toBeUndefined();
    expect(video.indexSource).toEqual({
      kind: "external",
      url: "https://cdn.example/dash/video.mp4",
      byteRange: { start: 700, end: 1500 },
      periodStart: 0,
    });
  });
});

/**
 * Golden vectors from a real stream. The externalIds below are part of the
 * wire format (specs/segment-identity.md): peers on any player must derive
 * these exact numbers for these segments, so they are written as literals,
 * not computed from the parser under test.
 */
describe("dashManifestParser: real manifests", () => {
  const BASE = "https://dash.akamaized.net/akamai/bbb_30fps/";

  it("parses the bbb VOD: 11 representations, 159 four-second segments", () => {
    const parsed = dashManifestParser.parse(
      readFixture("bbb_30fps.mpd"),
      BBB_MPD_URL,
    );

    expect(parsed.streams.map((s) => s.key)).toEqual([
      "bbb_30fps_1024x576_2500k",
      "bbb_30fps_1280x720_4000k",
      "bbb_30fps_1920x1080_8000k",
      "bbb_30fps_320x180_200k",
      "bbb_30fps_320x180_400k",
      "bbb_30fps_480x270_600k",
      "bbb_30fps_640x360_1000k",
      "bbb_30fps_640x360_800k",
      "bbb_30fps_768x432_1500k",
      "bbb_30fps_3840x2160_12000k",
      "bbb_a64k",
    ]);
    expect(parsed.streams.every((s) => !s.isLive)).toBe(true);
    expect(parsed.streams.every((s) => s.segments?.length === 159)).toBe(true);

    const video = parsed.streams[0];
    expect(video.type).toBe("main");
    expect(video.properties).toMatchObject({
      bitrate: 3134488,
      codecs: "avc1.64001f",
      width: 1024,
      height: 576,
      frameRate: 30,
    });
    expect(video.initSegments?.[0].url).toBe(
      `${BASE}bbb_30fps_1024x576_2500k/bbb_30fps_1024x576_2500k_0.m4v`,
    );
    expect(video.segments?.[0].url).toBe(
      `${BASE}bbb_30fps_1024x576_2500k/bbb_30fps_1024x576_2500k_1.m4v`,
    );

    const audio = parsed.streams[10];
    expect(audio.type).toBe("secondary");
    // Audio identity carries no bitrate, exactly as the engines' extractors
    // build it; the Representation id is the rendition's stable name.
    expect(audio.properties).toMatchObject({
      bitrate: 0,
      codecs: "mp4a.40.5",
      channels: 2,
      name: "bbb_a64k",
    });
  });

  it("derives the bbb externalIds every peer must agree on", () => {
    const registry = new ManifestRegistry();
    registry.apply(
      dashManifestParser.parse(readFixture("bbb_30fps.mpd"), BBB_MPD_URL),
    );

    // Video: duration 120 @ timescale 30 → 4.000 s → 40 per segment.
    const video = Array.from(
      registry.getStream("bbb_30fps_1024x576_2500k")?.segments.values() ?? [],
    );
    expect(video.map((s) => s.externalId).slice(0, 3)).toEqual([0, 40, 80]);
    expect(video[158].externalId).toBe(6320);
    expect(video[158].startTime).toBe(632);
    // The presentation is 634.566 s long; the last segment is clipped to it.
    expect(video[158].endTime).toBeCloseTo(634.566, 3);

    // Audio: duration 192512 @ timescale 48000 → 4.01066… s; 40.1066… per
    // segment, rounded — so the ids drift off the video's by one every ~10.
    const audio = Array.from(
      registry.getStream("bbb_a64k")?.segments.values() ?? [],
    );
    expect(audio.map((s) => s.externalId).slice(0, 3)).toEqual([0, 40, 80]);
    expect(audio[10].externalId).toBe(401);
    expect(audio[158].externalId).toBe(6337);
  });
});

describe("dashManifestParser: segment lists computed from the clock", () => {
  /** The template fixture parsed `seconds` after its availability start. */
  const at = (seconds: number) =>
    dashManifestParser.parse(DASH_TEMPLATE_DURATION_DYNAMIC, URL, {
      now: DASH_LIVE_START + seconds * 1000,
    });
  const numbers = (parsed: ReturnType<typeof at>) =>
    parsed.streams.map((stream) =>
      stream.segments?.map((s) => /(\d+)\.m4s$/.exec(s.url)?.[1]),
    );

  it("lists the window for the moment it is given", () => {
    // 100 s in, the window of 60 s holds the segments that ended after 40 s:
    // numbers 5 to 11, from 40 s to 96 s.
    const parsed = at(100);
    expect(numbers(parsed)).toEqual([
      ["5", "6", "7", "8", "9", "10", "11"],
      ["5", "6", "7", "8", "9", "10", "11"],
    ]);
    expect(parsed.streams[0].segments?.[0].presentationTime).toBe(40);
  });

  it("lists one segment more once the next has ended", () => {
    expect(numbers(at(104))[0]).toEqual([
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
    ]);
  });

  it("says when the list next changes", () => {
    // Segment 12 ends at 104 s; 5 leaves when 108 s less the window passes 48 s.
    expect(at(100).clock?.nextChangeAt).toBe(DASH_LIVE_START + 104_000);
    expect(at(104).clock?.nextChangeAt).toBe(DASH_LIVE_START + 108_000);
  });

  it("names the time sources a browser can use, in the MPD's order", () => {
    expect(at(100).clock?.utcTiming).toEqual([
      // The NTP source before it is left out; a relative URL resolves
      // against the MPD's.
      { method: "get", url: "https://cdn.example/time?iso" },
      // One value naming two servers is two sources.
      { method: "head", url: "https://a.example/t" },
      { method: "head", url: "https://b.example/t" },
      { method: "direct", time: Date.parse("2026-01-01T00:10:00Z") },
    ]);
  });

  it("reads a direct time with no time zone as UTC", () => {
    const parsed = dashManifestParser.parse(
      DASH_TEMPLATE_DURATION_DYNAMIC.replace(
        'value="2026-01-01T00:10:00Z"',
        'value="2026-01-01T00:10:00"',
      ),
      URL,
      { now: DASH_LIVE_START + 100_000 },
    );
    expect(parsed.clock?.utcTiming).toContainEqual({
      method: "direct",
      time: Date.parse("2026-01-01T00:10:00Z"),
    });
  });

  it("reports the clock of a timeline that repeats until the present", () => {
    const parsed = dashManifestParser.parse(DASH_SEGMENT_TIMELINE_OPEN, URL, {
      now: DASH_LIVE_START + 60_000,
    });
    expect(parsed.clock).toEqual({
      utcTiming: [],
      nextChangeAt: DASH_LIVE_START + 64_000,
    });
  });

  it("lists an open timeline up to the present, not up to the next refresh", () => {
    // mpd-parser repeats the open 4 s entry to 61 s + 10 s, starting
    // segments up to 68 s. Those that have not ended by 61 s are not
    // available yet: the list ends with the one from 56 s to 60 s, and the
    // next one becomes available at 64 s.
    const parsed = dashManifestParser.parse(
      DASH_SEGMENT_TIMELINE_OPEN.replace(
        'minimumUpdatePeriod="PT4S"',
        'minimumUpdatePeriod="PT10S"',
      ),
      URL,
      { now: DASH_LIVE_START + 61_000 },
    );
    const segments = parsed.streams[0].segments ?? [];
    expect(segments).toHaveLength(15);
    expect(segments[segments.length - 1].presentationTime).toBe(56);
    expect(parsed.clock?.nextChangeAt).toBe(DASH_LIVE_START + 64_000);
  });

  it("trims every stream of an MPD with an open timeline to the segments that have ended", () => {
    const now = DASH_LIVE_START + 61_000;
    const parsed = dashManifestParser.parse(DASH_OPEN_TIMELINE_MIXED, URL, {
      now,
    });
    const byKey = new Map(parsed.streams.map((s) => [s.key, s.segments ?? []]));
    const ends = (key: string) =>
      (byKey.get(key) ?? []).map((s) => (s.presentationTime ?? 0) + s.duration);

    // The open timeline, listed by mpd-parser to 61 s + 4 s, ends with the
    // segment that ended at 60 s.
    expect(ends("vo")).toHaveLength(15);
    expect(Math.max(...ends("vo"))).toBe(60);

    // The explicit timeline loses only the segment the origin published
    // ahead, which ends at 64 s.
    expect(ends("a")).toHaveLength(15);
    expect(Math.max(...ends("a"))).toBe(60);

    // The duration template loses nothing: it is what mpd-parser lists for it
    // in an MPD with no open timeline, which is not trimmed.
    const alone = dashManifestParser.parse(
      DASH_OPEN_TIMELINE_MIXED.replace(
        /<AdaptationSet mimeType="video\/mp4">\s*<Representation id="vo"[\s\S]*?<\/AdaptationSet>/,
        "",
      ),
      URL,
      { now },
    );
    expect(alone.streams.map((s) => s.key)).toEqual(["vd", "a"]);
    expect(ends("vd")).toHaveLength(15);
    expect(byKey.get("vd")).toEqual(
      alone.streams.find((s) => s.key === "vd")?.segments,
    );

    // All three lists next change at 64 s.
    expect(parsed.clock?.nextChangeAt).toBe(DASH_LIVE_START + 64_000);
  });

  it("reports no clock where the list does not depend on it", () => {
    for (const mpd of [
      DASH_SEGMENT_TEMPLATE,
      DASH_SEGMENT_TIMELINE_DYNAMIC,
      DASH_SEGMENT_BASE_LIVE,
    ]) {
      expect(dashManifestParser.parse(mpd, URL).clock).toBeUndefined();
    }
  });
});
