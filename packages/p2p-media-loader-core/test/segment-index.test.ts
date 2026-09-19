import { describe, expect, it, vi } from "vitest";
import { Core } from "../src/core.js";
import { dashManifestParser } from "../src/manifest/dash.js";
import { hlsManifestParser } from "../src/manifest/hls.js";
import {
  ANGEL_ONE_AUDIO_EN_URL,
  ANGEL_ONE_MPD_URL,
  NETFLIX_TC1_MPD_URL,
  NETFLIX_TC1_VIDEO_0500_URL,
  readBinaryFixture,
  readFixture,
} from "./fixtures/index.js";

const INDEX_RANGE = { start: 786, end: 1009 };
const INIT_RANGE = { start: 0, end: 785 };

function createCore() {
  const core = new Core({ manifestParsers: [dashManifestParser] });
  core.processManifest({
    url: ANGEL_ONE_MPD_URL,
    data: readFixture("angel-one.mpd"),
  });
  return core;
}

describe("external segment index (SegmentBase)", () => {
  it("registers SegmentBase streams without segments and recognises their index requests", () => {
    const core = createCore();
    const onMiss = vi.fn();
    core.addEventListener("onSegmentRegistryMiss", onMiss);

    expect(core.getStreams().length).toBeGreaterThan(10);
    expect(core.isSegmentIndex(ANGEL_ONE_AUDIO_EN_URL, INDEX_RANGE)).toBe(true);
    // A wider fetch that covers the index counts; a media request does not.
    expect(
      core.isSegmentIndex(ANGEL_ONE_AUDIO_EN_URL, { start: 0, end: 1009 }),
    ).toBe(true);
    expect(
      core.isSegmentIndex(ANGEL_ONE_AUDIO_EN_URL, { start: 1010, end: 2000 }),
    ).toBe(false);
    expect(
      core.isSegmentIndex(
        "https://storage.googleapis.com/shaka-demo-assets/angel-one/other.mp4",
        INDEX_RANGE,
      ),
    ).toBe(false);

    // Neither the index nor the init segment is a registry miss.
    expect(core.isSegmentLoadable(ANGEL_ONE_AUDIO_EN_URL, INDEX_RANGE)).toBe(
      false,
    );
    expect(core.isSegmentLoadable(ANGEL_ONE_AUDIO_EN_URL, INIT_RANGE)).toBe(
      false,
    );
    expect(onMiss).not.toHaveBeenCalled();
  });

  it("lays the segments out from the index exactly as mpd-parser would", () => {
    const core = createCore();
    const processed = core.processSegmentIndex({
      url: ANGEL_ONE_AUDIO_EN_URL,
      byteRange: INDEX_RANGE,
      data: readBinaryFixture("angel-one-audio-en.sidx"),
    });

    // The whole presentation is described, with this index's stream filled in.
    const resolved = processed?.streams.filter((s) => s.segmentCount > 0);
    expect(resolved).toHaveLength(1);
    expect(resolved?.[0]).toMatchObject({
      type: "secondary",
      isLive: false,
      start: 0,
      segmentCount: 16,
    });
    // Fifteen ~4.01 s subsegments and a 512-sample tail: 60.021 s.
    expect(resolved?.[0].end).toBeCloseTo(60.021, 3);

    // Subsegments follow each other from the end of the index (firstOffset 0).
    expect(
      core.isSegmentLoadable(ANGEL_ONE_AUDIO_EN_URL, {
        start: 1010,
        end: 1010 + 0xcd24 - 1,
      }),
    ).toBe(true);
    // Identity: presentation time in 100 ms units, accumulated from the period start.
    const second = { start: 1010 + 0xcd24, end: 1010 + 0xcd24 + 0xfd4d - 1 };
    expect(core.isSegmentLoadable(ANGEL_ONE_AUDIO_EN_URL, second)).toBe(true);
    expect(
      core.hasSegment(ANGEL_ONE_AUDIO_EN_URL, { start: 1010, end: 1010 }),
    ).toBe(false);
  });

  it("gives every resolved segment the presentation-time identity", () => {
    const core = createCore();
    core.processSegmentIndex({
      url: ANGEL_ONE_AUDIO_EN_URL,
      byteRange: INDEX_RANGE,
      data: readBinaryFixture("angel-one-audio-en.sidx"),
    });
    const stream = core.getStreams().find((s) => s.runtimeId === "13");
    expect(stream?.type).toBe("secondary");
    // Reach the segments through the registry-facing API the loaders use.
    const segments = (
      core as unknown as {
        streams: Map<
          string,
          { segments: Map<string, { externalId: number; startTime: number }> }
        >;
      }
    ).streams.get("13")?.segments;
    const ids = Array.from(segments?.values() ?? []).map((s) => s.externalId);
    // 4.0107 s per subsegment → 40.107 per step, rounded.
    expect(ids.slice(0, 4)).toEqual([0, 40, 80, 120]);
    expect(ids[15]).toBe(600);
    expect(ids).toHaveLength(16);
  });

  it("resolves a wider fetch that carries init and index together, and ignores junk", () => {
    const core = createCore();
    const sidx = readBinaryFixture("angel-one-audio-en.sidx");
    const combined = new Uint8Array(786 + sidx.length);
    // A plausible init segment prefix: an ftyp box padded to 786 bytes.
    new DataView(combined.buffer).setUint32(0, 786);
    combined.set([0x66, 0x74, 0x79, 0x70], 4);
    combined.set(sidx, 786);

    const processed = core.processSegmentIndex({
      url: ANGEL_ONE_AUDIO_EN_URL,
      byteRange: { start: 0, end: 1009 },
      data: combined,
    });
    expect(
      processed?.streams.find((stream) => stream.segmentCount > 0),
    ).toMatchObject({ segmentCount: 16 });

    expect(
      core.processSegmentIndex({
        url: ANGEL_ONE_AUDIO_EN_URL,
        byteRange: INDEX_RANGE,
        data: new Uint8Array(10),
      }),
    ).toBeUndefined();
    expect(
      core.processSegmentIndex({
        url: "https://elsewhere.example/x.mp4",
        byteRange: INDEX_RANGE,
        data: sidx,
      }),
    ).toBeUndefined();
  });

  it("anchors subsegments on the sidx box, not the index range, when firstOffset skips a trailing box", () => {
    // Netflix test case 1a: indexRange 985-11245 holds a 3964-byte sidx and a
    // 6297-byte uuid box; firstOffset is 6297. Media starts at 11246, right
    // after the range — where Shaka requests it. Anchoring on the range end
    // (mpd-parser's layout) would put it at 17543 and match nothing.
    const core = new Core({ manifestParsers: [dashManifestParser] });
    core.processManifest({
      url: NETFLIX_TC1_MPD_URL,
      data: readFixture("netflix-tc1.mpd"),
    });
    const indexRange = { start: 985, end: 11245 };
    expect(core.isSegmentIndex(NETFLIX_TC1_VIDEO_0500_URL, indexRange)).toBe(
      true,
    );

    const processed = core.processSegmentIndex({
      url: NETFLIX_TC1_VIDEO_0500_URL,
      byteRange: indexRange,
      data: readBinaryFixture("netflix-tc1-video-0500.sidx"),
    });
    expect(
      processed?.streams.find((stream) => stream.segmentCount > 0),
    ).toMatchObject({ type: "main", segmentCount: 327 });

    const first = { start: 11246, end: 11246 + 100613 - 1 };
    expect(core.isSegmentLoadable(NETFLIX_TC1_VIDEO_0500_URL, first)).toBe(
      true,
    );
    expect(
      core.isSegmentLoadable(NETFLIX_TC1_VIDEO_0500_URL, {
        start: 17543,
        end: 17543 + 100613 - 1,
      }),
    ).toBe(false);
    const second = { start: first.end + 1, end: first.end + 79625 };
    expect(core.isSegmentLoadable(NETFLIX_TC1_VIDEO_0500_URL, second)).toBe(
      true,
    );
    // 2.002 s subsegments (20020000 / 10^7) → ids 0, 20, 40 in 100 ms units.
    const segments = (
      core as unknown as {
        streams: Map<string, { segments: Map<string, { externalId: number }> }>;
      }
    ).streams.get(
      processed!.streams.find((stream) => stream.segmentCount > 0)!.key,
    )?.segments;
    expect(
      Array.from(segments?.values() ?? [])
        .slice(0, 3)
        .map((s) => s.externalId),
    ).toEqual([0, 20, 40]);
  });

  it("keeps what the index gave through a refresh of the manifest", () => {
    const core = createCore();
    core.processSegmentIndex({
      url: ANGEL_ONE_AUDIO_EN_URL,
      byteRange: INDEX_RANGE,
      data: readBinaryFixture("angel-one-audio-en.sidx"),
    });
    const segment = { start: 1010, end: 1010 + 0xcd24 - 1 };
    expect(core.isSegmentLoadable(ANGEL_ONE_AUDIO_EN_URL, segment)).toBe(true);

    // The MPD lists no segments for a SegmentBase representation, on the
    // first parse and on every refresh alike.
    core.processManifest({
      url: ANGEL_ONE_MPD_URL,
      data: readFixture("angel-one.mpd"),
    });

    expect(core.isSegmentLoadable(ANGEL_ONE_AUDIO_EN_URL, segment)).toBe(true);
  });

  it("reads the index with the parser whose protocol has one", () => {
    // The reader travels with the DASH parser rather than sitting in core, so
    // an HLS-only deployment never links it. A core given the HLS parser
    // alone has nothing to read an index with. See specs/packaging.md.
    const core = new Core({ manifestParsers: [hlsManifestParser] });

    expect(hlsManifestParser.parseSegmentIndex).toBeUndefined();
    expect(dashManifestParser.parseSegmentIndex).toBeDefined();
    expect(
      core.processSegmentIndex({
        url: ANGEL_ONE_AUDIO_EN_URL,
        byteRange: INDEX_RANGE,
        data: readBinaryFixture("angel-one-audio-en.sidx"),
      }),
    ).toBeUndefined();
  });
});
