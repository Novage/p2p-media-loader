import { describe, expect, it } from "vitest";
import { hlsManifestParser } from "../src/manifest/hls.js";
import {
  HLS_LIVE_LL,
  HLS_LIVE_NO_PDT_REFRESH_1,
  HLS_MASTER_WITH_AUDIO,
  HLS_MASTER_WITH_VIDEO_RENDITIONS,
  HLS_MEDIA_IFRAMES_ONLY,
  HLS_MEDIA_VOD_BYTERANGE,
  HLS_MEDIA_WEBVTT,
  IVS_MASTER_URL,
  MUX_720P_URL,
  MUX_MASTER_URL,
  readFixture,
} from "./fixtures/index.js";

const BASE = "https://cdn.example/live/master.m3u8";

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
    // A streamIdBuilder reads them unnormalized, so the exact values matter.
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

  it("keeps a variant's metadata when it declares no usable bandwidth", () => {
    // A resolution and a codec string are read the same by every peer
    // whether BANDWIDTH is there or not.
    expect(main[1].properties).toMatchObject({
      bitrate: 0,
      codecs: "avc1.4d401f",
      width: 640,
      height: 360,
    });
  });

  it("gives a variant declaring nothing at all its place in the master", () => {
    const master = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000000,CODECS="avc1.64002a",RESOLUTION=1920x1080
hi.m3u8
#EXT-X-STREAM-INF:PROGRAM-ID=1
bare.m3u8
`;
    const bare = hlsManifestParser
      .parse(master, BASE)
      .streams.find((s) => s.key.endsWith("bare.m3u8"))!;
    expect(bare.properties).toEqual({
      bitrate: 0,
      codecs: undefined,
      width: undefined,
      height: undefined,
      frameRate: undefined,
      videoRange: undefined,
    });
    expect(bare).toMatchObject({ streamId: "main1", index: 1 });
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

  it("records an initialization segment a discontinuity introduces", () => {
    const playlist = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-MAP:URI="init-a.mp4"
#EXTINF:6.0,
a1.mp4
#EXT-X-DISCONTINUITY
#EXT-X-MAP:URI="init-b.mp4"
#EXTINF:6.0,
b1.mp4
#EXT-X-ENDLIST
`;
    const [stream] = hlsManifestParser.parse(
      playlist,
      "https://cdn.example/vod/720p/index.m3u8",
    ).streams;
    expect(stream.initSegments?.map((i) => i.url)).toEqual([
      "https://cdn.example/vod/720p/init-a.mp4",
      "https://cdn.example/vod/720p/init-b.mp4",
    ]);
  });

  it("declares no stream for subtitles, closed captions or I-frame playlists", () => {
    expect(parsed.streams.map((s) => s.key)).toEqual([
      "https://cdn.example/live/video/1080p/index.m3u8",
      "https://cdn.example/live/video/360p/index.m3u8",
      "https://cdn.example/live/audio/en/index.m3u8",
      "https://cdn.example/live/audio/de/index.m3u8",
    ]);
  });

  it("names the subtitle and I-frame playlists so the registry knows them on arrival", () => {
    expect(parsed.excludedPlaylists).toEqual([
      "https://cdn.example/live/video/1080p/iframes.m3u8",
      "https://cdn.example/live/subs/en/index.m3u8",
      "https://cdn.example/live/subs/de/index.m3u8",
    ]);
  });

  it("names no playlist for an I-frame entry that has no URI", () => {
    // m3u8-parser only warns about the missing attribute; resolving nothing
    // against the master would exclude a real path ending in "undefined".
    const master = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000000,CODECS="avc1.64002a",RESOLUTION=1920x1080
hi.m3u8
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=100000,CODECS="avc1.64002a"
`;
    expect(hlsManifestParser.parse(master, BASE).excludedPlaylists).toEqual([]);
  });

  it("names nothing to exclude from a master without text or trick play", () => {
    const master = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000000,CODECS="avc1.64002a",RESOLUTION=1920x1080
hi.m3u8
`;
    expect(hlsManifestParser.parse(master, BASE).excludedPlaylists).toEqual([]);
  });
});

describe("hlsManifestParser: alternate video renditions", () => {
  const parsed = hlsManifestParser.parse(
    HLS_MASTER_WITH_VIDEO_RENDITIONS,
    BASE,
  );

  it("declares a main stream per rendition with a playlist of its own", () => {
    // "Main" is the variant's playlist and "Muxed" has none: neither is a
    // stream beside the variant. Variants first, then renditions.
    expect(parsed.streams.map((s) => [s.key, s.type])).toEqual([
      ["https://cdn.example/live/video/1080p/index.m3u8", "main"],
      ["https://cdn.example/live/video/720p/index.m3u8", "main"],
      ["https://cdn.example/live/video/1080p/wide.m3u8", "main"],
      ["https://cdn.example/live/video/720p/wide.m3u8", "main"],
    ]);
    expect(parsed.excludedPlaylists).toEqual([]);
  });

  it("gives a rendition its variant's attributes and its own name and language", () => {
    const [variant, , wide] = parsed.streams;
    expect(wide.properties).toEqual({
      bitrate: 5000000,
      codecs: "avc1.64002a",
      width: 1920,
      height: 1080,
      frameRate: 30,
      videoRange: undefined,
      language: "en",
      name: "Wide",
    });
    // The group leaves the variant exactly as it would be read without one: a
    // rendition's NAME and LANGUAGE are the rendition's, never the variant's.
    expect(variant.properties).toEqual({
      bitrate: 5000000,
      codecs: "avc1.64002a",
      width: 1920,
      height: 1080,
      frameRate: 30,
      videoRange: undefined,
    });
    expect(parsed.streams[3].properties).toMatchObject({
      bitrate: 2500000,
      width: 1280,
      name: "Wide",
      language: undefined,
    });
  });

  it("reads a group two variants share by the first of them, once", () => {
    // Malformed by RFC 8216 — every rendition must match each referencing
    // variant's resolution — so the first variant's reading is taken and the
    // rendition is one stream, not one per variant.
    const master = `#EXTM3U
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="cam",NAME="Wide",URI="wide.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=5000000,CODECS="avc1.64002a",RESOLUTION=1920x1080,VIDEO="cam"
1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,CODECS="avc1.4d401f",RESOLUTION=1280x720,VIDEO="cam"
720p.m3u8
`;
    const renditions = hlsManifestParser
      .parse(master, BASE)
      .streams.filter((s) => s.properties.name !== undefined);
    expect(renditions).toHaveLength(1);
    expect(renditions[0]).toMatchObject({
      key: "https://cdn.example/live/wide.m3u8",
      properties: { bitrate: 5000000, height: 1080, name: "Wide" },
    });
  });

  it("excludes the renditions of a group no variant references", () => {
    // Nothing plays them, and declared they would take an index; their
    // playlists register nothing if they ever arrive.
    const master = `#EXTM3U
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="orphan",NAME="Wide",URI="orphan/wide.m3u8"
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="cam",NAME="Wide",URI="cam/wide.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=5000000,CODECS="avc1.64002a",RESOLUTION=1920x1080,VIDEO="cam"
1080p.m3u8
`;
    const parsed = hlsManifestParser.parse(master, BASE);
    expect(parsed.streams.map((s) => s.key)).toEqual([
      "https://cdn.example/live/1080p.m3u8",
      "https://cdn.example/live/cam/wide.m3u8",
    ]);
    expect(parsed.excludedPlaylists).toEqual([
      "https://cdn.example/live/orphan/wide.m3u8",
    ]);
  });

  it("excludes an audio group no variant references, like a video one", () => {
    const master = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="orphan",NAME="Commentary",URI="orphan/audio.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",URI="aud/en.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=5000000,CODECS="avc1.64002a,mp4a.40.2",RESOLUTION=1920x1080,AUDIO="aud"
1080p.m3u8
`;
    const parsed = hlsManifestParser.parse(master, BASE);
    expect(parsed.streams.map((s) => s.key)).toEqual([
      "https://cdn.example/live/1080p.m3u8",
      "https://cdn.example/live/aud/en.m3u8",
    ]);
    expect(parsed.excludedPlaylists).toEqual([
      "https://cdn.example/live/orphan/audio.m3u8",
    ]);
  });

  it("never excludes a URI a declared stream has, whatever else names it", () => {
    // Malformed: the I-frame playlist and a subtitle rendition both name the
    // variant's playlist. The variant keeps it, on both sides of the list.
    const master = `#EXTM3U
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",URI="1080p.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=5000000,CODECS="avc1.64002a",RESOLUTION=1920x1080,SUBTITLES="subs"
1080p.m3u8
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=100000,CODECS="avc1.64002a",URI="1080p.m3u8"
`;
    expect(hlsManifestParser.parse(master, BASE).excludedPlaylists).toEqual([]);
  });

  it("declares an audio rendition once, even at a URI a variant already has", () => {
    const master = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",URI="1080p.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=5000000,CODECS="avc1.64002a,mp4a.40.2",RESOLUTION=1920x1080,AUDIO="aud"
1080p.m3u8
`;
    const parsed = hlsManifestParser.parse(master, BASE);
    expect(parsed.streams.map((s) => [s.key, s.type, s.streamId])).toEqual([
      ["https://cdn.example/live/1080p.m3u8", "main", "main0"],
    ]);
  });

  it("declares nothing from a group whose renditions have no playlist", () => {
    // The common form — IVS names its groups this way — where each rendition
    // is muxed into the variant that references it.
    const parsed = hlsManifestParser.parse(
      readFixture("ivs-master.m3u8"),
      IVS_MASTER_URL,
    );
    expect(parsed.streams).toHaveLength(4);
    expect(parsed.streams.every((s) => s.properties.name === undefined)).toBe(
      true,
    );
  });
});

describe("hlsManifestParser: the default stream ID", () => {
  const ids = (master: string) =>
    hlsManifestParser
      .parse(master, BASE)
      .streams.map((s) => [s.key.replace(/^.*\//, ""), s.streamId, s.index]);

  it("numbers each type's streams from 0, in the order of the master", () => {
    expect(ids(HLS_MASTER_WITH_AUDIO)).toEqual([
      ["index.m3u8", "main0", 0],
      ["index.m3u8", "main1", 1],
      ["index.m3u8", "secondary0", 0],
      ["index.m3u8", "secondary1", 1],
    ]);
  });

  it("does not sort the variants: the master's order is the index", () => {
    expect(
      ids(`#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
1080p.m3u8
`),
    ).toEqual([
      ["720p.m3u8", "main0", 0],
      ["360p.m3u8", "main1", 1],
      ["1080p.m3u8", "main2", 2],
    ]);
  });

  it("counts a playlist listed under several variants once, at its first listing", () => {
    // One video playlist per audio group: two EXT-X-STREAM-INF, one stream.
    expect(
      ids(`#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="English",URI="aac/en.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="ec3",NAME="English",URI="ec3/en.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=2600000,CODECS="avc1.64001f,mp4a.40.2",RESOLUTION=1280x720,AUDIO="aac"
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2900000,CODECS="avc1.64001f,ec-3",RESOLUTION=1280x720,AUDIO="ec3"
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=900000,CODECS="avc1.64001e,mp4a.40.2",RESOLUTION=640x360,AUDIO="aac"
360p.m3u8
`),
    ).toEqual([
      ["720p.m3u8", "main0", 0],
      ["360p.m3u8", "main1", 1],
      ["en.m3u8", "secondary0", 0],
      ["en.m3u8", "secondary1", 1],
    ]);
  });

  it("numbers audio groups in the order the variants first reference them", () => {
    const parsed = hlsManifestParser.parse(
      `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="late",NAME="English",URI="late/en.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="early",NAME="English",URI="early/en.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=900000,CODECS="avc1.64001e,mp4a.40.2",AUDIO="early"
a.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2600000,CODECS="avc1.64001f,mp4a.40.2",AUDIO="late"
b.m3u8
`,
      BASE,
    );
    expect(
      parsed.streams
        .filter((s) => s.type === "secondary")
        .map((s) => [s.key, s.streamId]),
    ).toEqual([
      ["https://cdn.example/live/early/en.m3u8", "secondary0"],
      ["https://cdn.example/live/late/en.m3u8", "secondary1"],
    ]);
  });

  it("keeps the master's order of renditions with numeric names", () => {
    // m3u8-parser keys a group's renditions by NAME in an object, which lists
    // integer-like keys in numeric order.
    expect(
      ids(`#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="2",URI="two.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="1",URI="one.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Main",URI="main.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=900000,CODECS="avc1.64001e,mp4a.40.2",AUDIO="aud"
v.m3u8
`),
    ).toEqual([
      ["v.m3u8", "main0", 0],
      ["two.m3u8", "secondary0", 0],
      ["one.m3u8", "secondary1", 1],
      ["main.m3u8", "secondary2", 2],
    ]);
  });

  it("keeps an audio-only variant's audio codecs, its only codec", () => {
    const [aac, heAac] = hlsManifestParser.parse(
      `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2"
aac-128.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=64000,CODECS="mp4a.40.5"
aac-64.m3u8
`,
      BASE,
    ).streams;
    expect(aac.properties.codecs).toBe("mp4a.40.2");
    expect(heAac.properties.codecs).toBe("mp4a.40.5");
  });

  it("numbers an audio-only master's variants as main streams", () => {
    expect(
      ids(`#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2"
aac-128.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=64000,CODECS="mp4a.40.5"
aac-64.m3u8
`),
    ).toEqual([
      ["aac-128.m3u8", "main0", 0],
      ["aac-64.m3u8", "main1", 1],
    ]);
  });

  it("leaves I-frame playlists, subtitles and renditions with no URI out of the count", () => {
    expect(
      ids(`#EXTM3U
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",URI="subs/en.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Muxed"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Commentary",URI="commentary.m3u8"
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=100000,URI="iframes.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=900000,CODECS="avc1.64001e,mp4a.40.2",AUDIO="aud",SUBTITLES="subs"
v.m3u8
`),
    ).toEqual([
      ["v.m3u8", "main0", 0],
      ["commentary.m3u8", "secondary0", 0],
    ]);
  });

  it("gives a media playlist no stream ID: it cannot know its place", () => {
    const [stream] = hlsManifestParser.parse(
      HLS_MEDIA_VOD_BYTERANGE,
      "https://cdn.example/vod/index.m3u8",
    ).streams;
    expect(stream.streamId).toBeUndefined();
    expect(stream.index).toBeUndefined();
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
    expect(stream.initSegments).toEqual([
      {
        url: "https://cdn.example/vod/720p/init.mp4",
        byteRange: { start: 0, end: 599 },
      },
    ]);
    expect(stream.segments).toEqual([
      {
        url: "https://cdn.example/vod/720p/media.mp4",
        byteRange: { start: 600, end: 1599 },
        duration: 6,
        sequence: 0,
        programDateTime: undefined,
      },
      {
        url: "https://cdn.example/vod/720p/media.mp4",
        byteRange: { start: 1600, end: 2799 },
        duration: 6,
        sequence: 1,
        programDateTime: undefined,
      },
      {
        url: "https://cdn.example/vod/720p/media.mp4",
        byteRange: { start: 2800, end: 3599 },
        duration: 4,
        sequence: 2,
        programDateTime: undefined,
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

  it("declares no stream from an I-frame playlist", () => {
    // EXT-X-I-FRAMES-ONLY says what it is; no master is needed to know.
    const parsed = hlsManifestParser.parse(HLS_MEDIA_IFRAMES_ONLY, BASE);
    expect(parsed.streams).toEqual([]);
  });

  it("reads a WebVTT playlist like any other media playlist", () => {
    // A subtitle playlist is not marked as one; it is the master that says
    // so, and the registry that acts on it.
    const [stream] = hlsManifestParser.parse(HLS_MEDIA_WEBVTT, BASE).streams;
    expect(stream.segments?.map((s) => s.url)).toEqual([
      "https://cdn.example/live/subs0.vtt",
      "https://cdn.example/live/subs1.vtt",
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
