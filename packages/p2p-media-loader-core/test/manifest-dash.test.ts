import { describe, expect, it } from "vitest";
import { dashManifestParser } from "../src/manifest/dash.js";
import { ManifestRegistry } from "../src/manifest/registry.js";
import {
  BBB_MPD_URL,
  DASH_MULTI_PERIOD,
  DASH_SEGMENT_BASE,
  DASH_SEGMENT_BASE_LIVE,
  DASH_SEGMENT_TEMPLATE,
  DASH_SEGMENT_TIMELINE_DYNAMIC,
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
      initSegment: { url: "https://cdn.example/dash/v720-init.mp4" },
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

  it("reports SegmentBase as an external index with no segments", () => {
    const [video] = dashManifestParser.parse(DASH_SEGMENT_BASE, URL).streams;
    expect(video.segments).toEqual([]);
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
    expect(video.initSegment?.url).toBe(
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
