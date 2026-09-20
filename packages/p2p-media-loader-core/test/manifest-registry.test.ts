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

  it("leaves a playlist anonymous when its URL matches more than one variant", () => {
    // A master that tells its variants apart by query string alone. With the
    // token rotated, the playlist matches both once the query is stripped,
    // and attaching it to whichever came first would register one
    // rendition's segments under the other's identity.
    const master = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720,CODECS="avc1.4d401f"
index.m3u8?v=720p
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080,CODECS="avc1.64002a"
index.m3u8?v=1080p
`;
    const registry = new ManifestRegistry();
    registry.apply(hls(master, MASTER));
    const playlist = "https://cdn.example/live/index.m3u8?v=rotated";
    registry.apply(hls(HLS_MEDIA_VOD_BYTERANGE, playlist));

    expect(registry.getStreams()).toHaveLength(3);
    for (const variant of ["720p", "1080p"]) {
      const stream = registry.getStream(
        `https://cdn.example/live/index.m3u8?v=${variant}`,
      );
      expect(stream?.segments.size).toBe(0);
    }
    const anonymous = registry.getStream(playlist);
    expect(anonymous?.identified).toBe(false);
    expect(anonymous?.segments.size).toBe(3);

    // The next load, under another token, is the same anonymous stream —
    // not a new one on every rotation.
    registry.apply(
      hls(HLS_MEDIA_VOD_BYTERANGE, "https://cdn.example/live/index.m3u8?v=t2"),
    );
    expect(registry.getStreams()).toHaveLength(3);
    expect(registry.getStream(playlist)?.segments.size).toBe(3);
  });

  it("attaches a master's declaration to an anonymous stream it names under another token", () => {
    // Registered beside the anonymous stream, the master's would take the
    // playlist's next refresh and leave the first behind with a stale segment
    // set. The identity stays what the first registration made it.
    const master = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080,CODECS="avc1.64002a"
video/1080p/index.m3u8?t=2
`;
    const registry = new ManifestRegistry();
    registry.apply(hls(HLS_MEDIA_VOD_BYTERANGE, `${MEDIA_1080}?t=1`));
    registry.apply(hls(master, MASTER));

    expect(registry.getStreams()).toHaveLength(1);
    const stream = registry.getStream(`${MEDIA_1080}?t=1`)!;
    expect(stream.identified).toBe(false);
    expect(stream.segments.size).toBe(3);

    registry.apply(hls(HLS_MEDIA_VOD_BYTERANGE, `${MEDIA_1080}?t=3`));
    expect(registry.getStreams()).toHaveLength(1);
  });

  it("keeps one stream when a re-fetched master rotates its playlist tokens", () => {
    const master = (token: string) => `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080,CODECS="avc1.64002a"
video/1080p/index.m3u8?t=${token}
`;
    const registry = new ManifestRegistry();
    registry.apply(hls(master("1"), MASTER));
    registry.apply(hls(HLS_MEDIA_VOD_BYTERANGE, `${MEDIA_1080}?t=1`));
    const identity = registry.getStream(`${MEDIA_1080}?t=1`)!.identityHash;

    registry.apply(hls(master("2"), MASTER));
    registry.apply(hls(HLS_MEDIA_VOD_BYTERANGE, `${MEDIA_1080}?t=2`));

    expect(registry.getStreams()).toHaveLength(1);
    const stream = registry.getStream(`${MEDIA_1080}?t=1`)!;
    expect(stream.identityHash).toBe(identity);
    expect(stream.segments.size).toBe(3);
  });

  it("does not guess which query-only variant an anonymous stream was", () => {
    const master = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720,CODECS="avc1.4d401f"
index.m3u8?v=720p
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080,CODECS="avc1.64002a"
index.m3u8?v=1080p
`;
    const registry = new ManifestRegistry();
    registry.apply(
      hls(HLS_MEDIA_VOD_BYTERANGE, "https://cdn.example/live/index.m3u8?v=t1"),
    );
    registry.apply(hls(master, MASTER));

    expect(registry.getStreams()).toHaveLength(3);
    expect(
      registry.getStream("https://cdn.example/live/index.m3u8?v=t1")
        ?.identified,
    ).toBe(false);
  });

  it("matches a media playlist the CDN redirected to another path", () => {
    const registry = new ManifestRegistry();
    registry.apply(hls(HLS_MASTER_WITH_AUDIO, MASTER));
    // The master named MEDIA_1080; the response came from somewhere else.
    registry.apply({
      ...hls(HLS_MEDIA_VOD_BYTERANGE, "https://edge7.example/x/aaa/index.m3u8"),
      requestedUrl: MEDIA_1080,
    });

    expect(registry.getStreams()).toHaveLength(4);
    const stream = registry.getStream(MEDIA_1080)!;
    expect(stream.segments.size).toBe(3);
    expect(stream.identified).toBe(true);
    // Segment URIs still resolve against the URL the response came from.
    expect([...stream.segments.keys()][0]).toBe(
      "https://edge7.example/x/aaa/media.mp4|600-1599",
    );
  });

  it("knows an unmatched playlist by what was asked for, however the CDN answers", () => {
    const registry = new ManifestRegistry();
    for (const path of ["aaa", "bbb", "ccc"]) {
      registry.apply({
        ...hls(
          HLS_MEDIA_VOD_BYTERANGE,
          `https://edge7.example/x/${path}/index.m3u8`,
        ),
        requestedUrl: MEDIA_1080,
      });
    }
    // One stream, not one per refresh.
    expect(registry.getStreams()).toHaveLength(1);
    expect(registry.getStream(MEDIA_1080)).toBeDefined();
  });

  it("registers a media playlist loaded without a master as one anonymous stream", () => {
    const registry = new ManifestRegistry();
    registry.apply(hls(HLS_MEDIA_VOD_BYTERANGE, MEDIA_1080));
    expect(registry.getStreams()).toHaveLength(1);
    expect(registry.getStream(MEDIA_1080)?.segments.size).toBe(3);
    // Nothing told it apart from any other stream; the core reads this to
    // decide whether such a stream may be shared.
    expect(registry.getStream(MEDIA_1080)?.identified).toBe(false);
  });

  it("keeps a stream anonymous when its media playlist came before its master", () => {
    // Not an order any player produces — the master is the first manifest a
    // player fetches — and not supported: the first manifest to register a
    // stream decides its identity, and a master arriving after does not
    // change it. The master's declaration attaches to the stream all the same.
    const registry = new ManifestRegistry();
    registry.apply(hls(HLS_MEDIA_VOD_BYTERANGE, MEDIA_1080));
    const anonymous = registry.getStream(MEDIA_1080)!.identityHash;

    registry.apply(hls(HLS_MASTER_WITH_AUDIO, MASTER));
    const stream = registry.getStream(MEDIA_1080)!;
    expect(stream.identified).toBe(false);
    expect(stream.identityHash).toBe(anonymous);
    expect(stream.type).toBe("main");
    expect(stream.segments.size).toBe(3);
    expect(registry.getStreams()).toHaveLength(4);
  });

  it("keeps the identity the first master gave, whatever a later one says", () => {
    const registry = new ManifestRegistry();
    registry.apply(hls(HLS_MASTER_WITH_AUDIO, MASTER));
    const identity = registry.getStream(MEDIA_1080)!.identityHash;

    // A live packager republishing its master with another BANDWIDTH must not
    // move a playing stream to a swarm with no peers in it.
    const republished = HLS_MASTER_WITH_AUDIO.replace(
      "BANDWIDTH=4521000",
      "BANDWIDTH=4498000",
    );
    registry.apply(hls(republished, MASTER));

    const stream = registry.getStream(MEDIA_1080)!;
    expect(stream.identityHash).toBe(identity);
    expect(stream.properties.bitrate).toBe(4521000);
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
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      streamKey: MEDIA_1080,
      added: 2,
      removed: 2,
      segmentCount: 5,
      isLive: true,
    });

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
    const [update] = registry.apply(hls(HLS_LIVE_NO_PDT_REFRESH_1, MEDIA_1080));
    expect(update).toMatchObject({ added: 0, removed: 0, segmentCount: 5 });
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

    const processed = core.processManifest({
      url: MUX_720P_URL,
      data: mediaText,
    });
    expect(core.hasSegment(firstSegmentUrl)).toBe(true);
    expect(core.isSegmentLoadable(firstSegmentUrl)).toBe(true);

    // What the media playlist described, for an adapter to size its player by.
    expect(processed?.streams).toHaveLength(1);
    expect(processed?.streams[0]).toMatchObject({
      key: MUX_720P_URL,
      type: "main",
      isLive: false,
      start: 0,
      segmentCount: 64,
    });
    expect(processed?.streams[0].end).toBeCloseTo(634.57, 1);
  });

  it("describes nothing for a master playlist and undefined for an unparsable one", () => {
    const core = new Core({ manifestParsers: [hlsManifestParser] });
    const master = core.processManifest({
      url: MUX_MASTER_URL,
      data: readFixture("mux-master.m3u8"),
    });
    expect(master?.streams).toEqual([]);
    expect(
      core.processManifest({ url: MASTER, data: DASH_SEGMENT_TEMPLATE }),
    ).toBeUndefined();
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
