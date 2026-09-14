import { describe, expect, it } from "vitest";
import { ManifestRegistry } from "../src/manifest/registry.js";
import { hlsManifestParser } from "../src/manifest/hls.js";
import { dashManifestParser } from "../src/manifest/dash.js";
import { Core } from "../src/index.js";
import {
  DASH_SEGMENT_TEMPLATE,
  HLS_LIVE_NO_PDT_REFRESH_1,
  HLS_LIVE_NO_PDT_REFRESH_2,
  HLS_MASTER_WITH_AUDIO,
  HLS_MEDIA_VOD_BYTERANGE,
  IVS_MASTER_URL,
  MUX_720P_URL,
  MUX_MASTER_URL,
  readFixture,
} from "./fixtures/index.js";

const MASTER = "https://cdn.example/live/master.m3u8";
const MEDIA_1080 = "https://cdn.example/live/video/1080p/index.m3u8";

const hls = (text: string, url: string) => hlsManifestParser.parse(text, url);

describe("ManifestRegistry: HLS streams and segments", () => {
  it("attaches a media playlist to the stream its master declared", () => {
    const registry = new ManifestRegistry();
    registry.apply(hls(HLS_MASTER_WITH_AUDIO, MASTER));
    registry.apply(hls(HLS_MEDIA_VOD_BYTERANGE, MEDIA_1080));

    const stream = registry.getStream(MEDIA_1080);
    expect(stream?.type).toBe("main");
    // Identity comes from the master, never from the media playlist.
    expect(stream?.properties.bitrate).toBe(4521000);
    expect(stream?.isLive).toBe(false);
    // Segment URIs resolve against the media playlist that declared them.
    expect([...(stream?.segments.keys() ?? [])]).toEqual([
      "https://cdn.example/live/video/1080p/media.mp4|600-1599",
      "https://cdn.example/live/video/1080p/media.mp4|1600-2799",
      "https://cdn.example/live/video/1080p/media.mp4|2800-3599",
    ]);
  });

  it("matches a media playlist whose query string differs from the master's URI", () => {
    const registry = new ManifestRegistry();
    registry.apply(hls(HLS_MASTER_WITH_AUDIO, MASTER));
    registry.apply(hls(HLS_MEDIA_VOD_BYTERANGE, `${MEDIA_1080}?token=rotated`));

    expect(registry.getStreams()).toHaveLength(4);
    expect(registry.getStream(MEDIA_1080)?.segments.size).toBe(3);
  });

  it("registers a media playlist loaded without a master as one anonymous stream", () => {
    const registry = new ManifestRegistry();
    registry.apply(hls(HLS_MEDIA_VOD_BYTERANGE, MEDIA_1080));
    expect(registry.getStreams()).toHaveLength(1);
    expect(registry.getStream(MEDIA_1080)?.segments.size).toBe(3);
  });

  it("uses the media sequence number as externalId", () => {
    const registry = new ManifestRegistry();
    registry.apply(hls(HLS_LIVE_NO_PDT_REFRESH_1, MEDIA_1080));
    const ids = [...registry.getStream(MEDIA_1080)!.segments.values()].map(
      (s) => s.externalId,
    );
    expect(ids).toEqual([100, 101, 102, 103, 104]);
  });
});

describe("ManifestRegistry: timeline stability without PDT", () => {
  it("keeps a segment's start time fixed while the live window slides", () => {
    const registry = new ManifestRegistry();
    registry.apply(hls(HLS_LIVE_NO_PDT_REFRESH_1, MEDIA_1080));
    const before = new Map(
      [...registry.getStream(MEDIA_1080)!.segments.values()].map((s) => [
        s.externalId,
        s.startTime,
      ]),
    );
    expect(before.get(100)).toBe(0);
    expect(before.get(102)).toBe(12);

    const updates = registry.apply(hls(HLS_LIVE_NO_PDT_REFRESH_2, MEDIA_1080));
    expect(updates).toEqual([{ streamKey: MEDIA_1080, added: 2, removed: 2 }]);

    const after = new Map(
      [...registry.getStream(MEDIA_1080)!.segments.values()].map((s) => [
        s.externalId,
        s.startTime,
      ]),
    );
    // Overlapping segments did not move; new ones continue from them.
    expect(after.get(102)).toBe(before.get(102));
    expect(after.get(104)).toBe(before.get(104));
    expect(after.get(105)).toBe(before.get(104)! + 6);
    expect(after.has(100)).toBe(false);
  });

  it("is idempotent", () => {
    const registry = new ManifestRegistry();
    registry.apply(hls(HLS_LIVE_NO_PDT_REFRESH_1, MEDIA_1080));
    expect(registry.apply(hls(HLS_LIVE_NO_PDT_REFRESH_1, MEDIA_1080))).toEqual(
      [],
    );
  });
});

describe("ManifestRegistry: PDT and DASH timelines", () => {
  it("uses programDateTime as the timeline when present", () => {
    const text = readFixture("ivs-720p-media.m3u8");
    const registry = new ManifestRegistry();
    registry.apply(hls(text, IVS_MASTER_URL));
    const [first] = registry.getStream(IVS_MASTER_URL)!.segments.values();

    const pdt = /#EXT-X-PROGRAM-DATE-TIME:(\S+)/.exec(text)?.[1];
    expect(first.startTime).toBeCloseTo(Date.parse(pdt!) / 1000, 3);
  });

  it("uses presentation time in 100 ms units as DASH externalId", () => {
    const registry = new ManifestRegistry();
    registry.apply(dashManifestParser.parse(DASH_SEGMENT_TEMPLATE, MASTER));
    const video = registry.getStream("video-720p")!;
    const segments = [...video.segments.values()];
    expect(segments.map((s) => s.externalId)).toEqual([
      0, 60, 120, 180, 240, 300, 360,
    ]);
    expect(segments.map((s) => s.startTime)).toEqual([
      0, 6, 12, 18, 24, 30, 36,
    ]);
  });
});

describe("Core.processManifest", () => {
  const mediaText = readFixture("mux-720p-media.m3u8");
  const firstSegmentUrl = hls(mediaText, MUX_720P_URL).streams[0].segments![0]
    .url;

  it("registers the streams a master declares and the segments its media playlist lists", () => {
    const core = new Core({ manifestParsers: [hlsManifestParser] });
    core.processManifest({
      url: MUX_MASTER_URL,
      data: readFixture("mux-master.m3u8"),
    });
    expect(core.getStreams().map((s) => s.runtimeId)).toContain(MUX_720P_URL);
    expect(core.hasSegment(firstSegmentUrl)).toBe(false);

    core.processManifest({ url: MUX_720P_URL, data: mediaText });
    expect(core.hasSegment(firstSegmentUrl)).toBe(true);
    expect(core.isSegmentLoadable(firstSegmentUrl)).toBe(true);
  });

  it("leaves the registry untouched when a manifest fails to parse", () => {
    const core = new Core({ manifestParsers: [hlsManifestParser] });
    core.processManifest({ url: MUX_720P_URL, data: mediaText });
    expect(core.hasSegment(firstSegmentUrl)).toBe(true);

    const bad = `#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="k",IV=0x1\n#EXTINF:6,\ns.ts\n`;
    core.processManifest({ url: MUX_720P_URL, data: bad });
    expect(core.hasSegment(firstSegmentUrl)).toBe(true);
  });

  it("ignores a manifest no configured parser can read", () => {
    const core = new Core({ manifestParsers: [hlsManifestParser] });
    core.processManifest({ url: MASTER, data: DASH_SEGMENT_TEMPLATE });
    expect(core.getStreams()).toEqual([]);
  });

  it("accepts ArrayBuffer payloads as Shaka delivers them", () => {
    const core = new Core({ manifestParsers: [hlsManifestParser] });
    const data = new TextEncoder().encode(mediaText).buffer;
    core.processManifest({ url: MUX_720P_URL, data });
    expect(core.hasSegment(firstSegmentUrl)).toBe(true);
  });
});
