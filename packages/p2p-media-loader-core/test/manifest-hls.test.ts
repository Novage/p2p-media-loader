import { describe, expect, it } from "vitest";
import { hlsManifestParser } from "../src/manifest/hls.js";
import { computeStreamIdentityHash } from "../src/index.js";
import {
  HLS_LIVE_LL,
  HLS_LIVE_NO_PDT_REFRESH_1,
  HLS_MASTER_WITH_AUDIO,
  HLS_MEDIA_VOD_BYTERANGE,
  IVS_MASTER_URL,
  MUX_720P_URL,
  MUX_MASTER_URL,
  readFixture,
} from "./fixtures/index.js";

const BASE = "https://cdn.example/live/master.m3u8";

const MISSING_METADATA_IDENTITY_HASH = "UYnLxGhQilEV4D0HbCx+kRv0ZF0=";

describe("hlsManifestParser: master playlist", () => {
  const parsed = hlsManifestParser.parse(HLS_MASTER_WITH_AUDIO, BASE);
  const main = parsed.streams.filter((s) => s.type === "main");
  const audio = parsed.streams.filter((s) => s.type === "secondary");

  it("sniffs the protocol", () => {
    expect(hlsManifestParser.canParse(HLS_MASTER_WITH_AUDIO)).toBe(true);
    expect(hlsManifestParser.canParse("<MPD/>")).toBe(false);
  });

  it("declares one main stream per variant, keyed by absolute media URL", () => {
    expect(main.map((s) => s.key)).toEqual([
      "https://cdn.example/live/video/1080p/index.m3u8",
      "https://cdn.example/live/video/360p/index.m3u8",
    ]);
    expect(main.every((s) => s.segments === undefined)).toBe(true);
  });

  it("reads a variant's properties as the manifest states them", () => {
    // These feed identity unnormalized, so the exact values matter.
    expect(main[0].properties).toMatchObject({
      bitrate: 4521000,
      codecs: "avc1.64002a",
      width: 1920,
      height: 1080,
      videoRange: "SDR",
    });
    expect(Number(main[0].properties.frameRate)).toBe(29.97);
  });

  it("keeps only video codecs on a video stream", () => {
    expect(main[0].properties.codecs).toBe("avc1.64002a");
  });

  it("prefers peak BANDWIDTH over AVERAGE-BANDWIDTH", () => {
    expect(main[0].properties.bitrate).toBe(4521000);
  });

  it("blanks metadata for a variant without bandwidth", () => {
    expect(computeStreamIdentityHash(main[1].properties)).toBe(
      MISSING_METADATA_IDENTITY_HASH,
    );
  });

  it("declares alternate audio renditions with CHANNELS m3u8-parser drops", () => {
    expect(audio.map((s) => s.key)).toEqual([
      "https://cdn.example/live/audio/en/index.m3u8",
      "https://cdn.example/live/audio/de/index.m3u8",
    ]);
    expect(audio[0].properties).toEqual({
      bitrate: 0,
      codecs: "mp4a.40.2",
      language: "en",
      channels: "2",
      name: "English",
    });
    expect(audio[1].properties.channels).toBe("6");
  });

  it("reads an alternate audio rendition's language and channels as written", () => {
    const master = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="English",LANGUAGE="en-US",CHANNELS="2/0",URI="en.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=1000000,CODECS="avc1.4d401f,mp4a.40.2",RESOLUTION=640x360,AUDIO="a"
v.m3u8
`;
    const [rendition] = hlsManifestParser
      .parse(master, BASE)
      .streams.filter((s) => s.type === "secondary");
    expect(rendition.properties).toEqual({
      bitrate: 0,
      codecs: "mp4a.40.2",
      language: "en-US",
      channels: "2/0",
      name: "English",
    });
  });

  it("ignores I-frame playlists", () => {
    expect(parsed.streams.some((s) => s.key.includes("iframes"))).toBe(false);
  });
});

describe("hlsManifestParser: media playlist", () => {
  it("emits segments with sequence numbers, byte ranges and the init segment", () => {
    const url = "https://cdn.example/vod/720p/index.m3u8";
    const [stream] = hlsManifestParser.parse(
      HLS_MEDIA_VOD_BYTERANGE,
      url,
    ).streams;

    expect(stream.key).toBe(url);
    expect(stream.isLive).toBe(false);
    expect(stream.initSegment).toEqual({
      url: "https://cdn.example/vod/720p/init.mp4",
      byteRange: { start: 0, end: 599 },
    });
    expect(stream.segments).toEqual([
      {
        url: "https://cdn.example/vod/720p/media.mp4",
        byteRange: { start: 600, end: 1599 },
        duration: 6,
        sequence: 0,
        programDateTime: undefined,
        discontinuity: undefined,
      },
      {
        url: "https://cdn.example/vod/720p/media.mp4",
        byteRange: { start: 1600, end: 2799 },
        duration: 6,
        sequence: 1,
        programDateTime: undefined,
        discontinuity: undefined,
      },
      {
        url: "https://cdn.example/vod/720p/media.mp4",
        byteRange: { start: 2800, end: 3599 },
        duration: 4,
        sequence: 2,
        programDateTime: undefined,
        discontinuity: true,
      },
    ]);
  });

  it("numbers segments from EXT-X-MEDIA-SEQUENCE", () => {
    const [stream] = hlsManifestParser.parse(
      HLS_LIVE_NO_PDT_REFRESH_1,
      BASE,
    ).streams;
    expect(stream.segments?.map((s) => s.sequence)).toEqual([
      100, 101, 102, 103, 104,
    ]);
    expect(stream.isLive).toBe(true);
  });

  it("emits whole segments only from a low-latency playlist", () => {
    const [stream] = hlsManifestParser.parse(HLS_LIVE_LL, BASE).streams;
    expect(stream.segments?.map((s) => s.url)).toEqual([
      "https://cdn.example/live/seg50.mp4",
      "https://cdn.example/live/seg51.mp4",
    ]);
  });

  it("throws on malformed input instead of guessing", () => {
    // m3u8-parser rejects a short EXT-X-KEY IV; the core turns this into
    // "leave the registry alone", never into a half-applied manifest.
    const bad = `#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="k",IV=0x1\n#EXTINF:6,\ns.ts\n`;
    expect(() => hlsManifestParser.parse(bad, BASE)).toThrow();
  });
});

describe("hlsManifestParser: real manifests", () => {
  it("parses the IVS live master into four rendition variants", () => {
    const parsed = hlsManifestParser.parse(
      readFixture("ivs-master.m3u8"),
      IVS_MASTER_URL,
    );
    const heights = parsed.streams.map((s) => s.properties.height).sort();
    expect(heights).toEqual([160, 360, 480, 720]);
    expect(parsed.streams.every((s) => s.key.startsWith("https://"))).toBe(
      true,
    );
    expect(parsed.streams[0].properties.codecs).toBe("avc1.4D401F");
  });

  it("parses the IVS live media playlist with PDT on every segment", () => {
    const text = readFixture("ivs-720p-media.m3u8");
    const [stream] = hlsManifestParser.parse(text, IVS_MASTER_URL).streams;
    const segments = stream.segments ?? [];

    expect(stream.isLive).toBe(true);
    expect(segments.length).toBeGreaterThan(5);
    expect(segments.every((s) => s.programDateTime !== undefined)).toBe(true);

    const first = /#EXT-X-MEDIA-SEQUENCE:(\d+)/.exec(text);
    const mediaSequence = Number(first?.[1]);
    expect(segments.map((s) => s.sequence)).toEqual(
      segments.map((_, i) => mediaSequence + i),
    );
  });

  it("parses the mux VOD: 64 ten-second segments, no PDT, ENDLIST", () => {
    const master = hlsManifestParser.parse(
      readFixture("mux-master.m3u8"),
      MUX_MASTER_URL,
    );
    expect(master.streams.map((s) => s.key)).toContain(MUX_720P_URL);

    const [media] = hlsManifestParser.parse(
      readFixture("mux-720p-media.m3u8"),
      MUX_720P_URL,
    ).streams;
    expect(media.isLive).toBe(false);
    expect(media.segments).toHaveLength(64);
    expect(media.segments?.[0]).toMatchObject({
      url: "https://test-streams.mux.dev/x36xhzz/url_0/url_462/193039199_mp4_h264_aac_hd_7.ts",
      duration: 10,
      sequence: 0,
    });
  });
});
