import { describe, expect, it } from "vitest";
import { dashManifestParser } from "../src/manifest/dash.js";
import { ManifestRegistry } from "../src/manifest/registry.js";
import { segmentKey } from "../src/manifest/url-key.js";
import {
  ANGEL_ONE_MPD_URL,
  BBB_MPD_URL,
  DASH_DYNAMIC_WITH_TRICK_MODE,
  DASH_LIVE_START,
  DASH_OPEN_TIMELINE_MIXED,
  DASH_MULTI_PERIOD,
  DASH_MULTI_PERIOD_OFFSET,
  DASH_PERIODS_LIVE,
  DASH_SEGMENT_BASE,
  DASH_SEGMENT_BASE_LIVE,
  DASH_SEGMENT_TEMPLATE,
  DASH_SEGMENT_TIMELINE_DYNAMIC,
  DASH_SEGMENT_TIMELINE_OFFSET,
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

  it("places a numbered template's segments from the period start, whatever its presentationTimeOffset", () => {
    // The offset says where the media timestamps begin; it does not move a
    // segment of a duration template on the presentation timeline.
    const [video] = dashManifestParser.parse(
      DASH_MULTI_PERIOD_OFFSET,
      URL,
    ).streams;
    expect(video.segments?.map((s) => s.presentationTime)).toEqual([
      0, 10, 20, 30,
    ]);
  });

  it("keeps presentation time global across live periods whose offset is their own start", () => {
    // livesim2's periods_60, 700 s in: segments 64 and 65 of the first period
    // and 66 to 69 of the second. mpd-parser lists a live period up to the
    // present, past the next one's start, so 66 to 69 also come under the
    // first period — with the same URLs, and now the same times.
    const parsed = dashManifestParser.parse(DASH_PERIODS_LIVE, URL, {
      now: DASH_LIVE_START + 700_000,
    });
    const [video] = parsed.streams;
    const timesByNumber = new Map<string, Set<number | undefined>>();
    for (const s of video.segments ?? []) {
      const number = /(\d+)\.m4s$/.exec(s.url)?.[1] ?? "";
      const times = timesByNumber.get(number) ?? new Set();
      times.add(s.presentationTime);
      timesByNumber.set(number, times);
    }
    expect(
      Array.from(timesByNumber, ([number, times]) => [number, [...times]]),
    ).toEqual([
      ["64", [640]],
      ["65", [650]],
      ["66", [660]],
      ["67", [670]],
      ["68", [680]],
      ["69", [690]],
    ]);

    // One identity per segment, rising with time: no period gives another
    // period's segment its identity.
    const registry = new ManifestRegistry();
    registry.apply(parsed);
    const ids = Array.from(
      registry.getStream("V300")?.segments.values() ?? [],
    ).map((s) => s.externalId);
    expect(ids).toEqual([6400, 6500, 6600, 6700, 6800, 6900]);
  });

  it("still takes a SegmentTimeline's presentationTimeOffset off its media time", () => {
    const [video] = dashManifestParser.parse(
      DASH_SEGMENT_TIMELINE_OFFSET,
      URL,
    ).streams;
    expect(video.segments?.map((s) => s.presentationTime)).toEqual([20, 24]);
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

  it("reports the segments of text and trick-mode sets as no stream's", () => {
    const parsed = dashManifestParser.parse(
      DASH_WITH_TEXT_IMAGE_AND_TRICK_MODE,
      URL,
    );
    const urls = parsed.nonStreamSegments?.map((s) => s.url) ?? [];
    for (const name of [
      // A WebVTT file given as the set's BaseURL alone is one segment.
      "subs-en.vtt",
      "fr-init.mp4",
      "fr-1.m4s",
      "trick-init.mp4",
      "trick-1.m4s",
      "trick2-1.m4s",
      "trick3-1.m4s",
    ]) {
      expect(urls).toContain(`https://cdn.example/dash/${name}`);
    }
    expect(urls).not.toContain("https://cdn.example/dash/v720-1.m4s");
    expect(urls).not.toContain("https://cdn.example/dash/aen-1.m4s");
    // mpd-parser reads neither thumbnails nor a text set it can tell only by
    // its TTML mimeType.
    expect(urls).not.toContain("https://cdn.example/dash/thumb-1.jpg");
    expect(urls).not.toContain("https://cdn.example/dash/subs-de.ttml");

    // Present on an MPD that lists none, so it replaces the last one's.
    expect(
      dashManifestParser.parse(DASH_SEGMENT_TEMPLATE, URL).nonStreamSegments,
    ).toEqual([]);
  });

  it("names each Representation by its type and @id", () => {
    const parsed = dashManifestParser.parse(
      DASH_WITH_TEXT_IMAGE_AND_TRICK_MODE,
      URL,
    );
    expect(parsed.streams.map((s) => [s.streamId, s.index])).toEqual([
      ["main-video-720p", undefined],
      ["secondary-audio-en", undefined],
    ]);
  });

  it("gives one @id in two periods one stream and one ID", () => {
    // An ad break and the content after it: the content's Representation
    // keeps its swarm across the break.
    const registry = new ManifestRegistry();
    registry.apply(dashManifestParser.parse(DASH_MULTI_PERIOD, URL));
    expect(registry.getStreams().map((s) => [s.key, s.streamId])).toEqual([
      ["v0", "main-v0"],
    ]);
  });

  it("cuts a live period's segments at the next period's start", () => {
    // mpd-parser lists p0's numbered segments up to the present, past p1's
    // start at 60.03 s, and gives a-16 (60.00–60.03 s) a full 4 s.
    const mpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-live:2011" type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z" minimumUpdatePeriod="PT2S" timeShiftBufferDepth="PT120S" minBufferTime="PT2S">
  <Period id="p0" start="PT0S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v" bandwidth="1000000" codecs="avc1.4d401f">
        <SegmentTemplate media="a-$Number$.m4s" initialization="a-init.mp4" duration="4" timescale="1" startNumber="1"/>
      </Representation>
    </AdaptationSet>
  </Period>
  <Period id="p1" start="PT60.03S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v" bandwidth="1000000" codecs="avc1.4d401f">
        <SegmentTemplate media="b-$Number$.m4s" initialization="b-init.mp4" duration="4" timescale="1" startNumber="1"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const parsed = dashManifestParser.parse(mpd, URL, { now: 80_000 });
    const tail = parsed.streams[0].segments?.filter(
      (s) => (s.presentationTime ?? 0) >= 56,
    );
    expect(
      tail?.map((s) => [
        s.url.split("/").pop(),
        s.presentationTime,
        Math.round(s.duration * 1000) / 1000,
      ]),
    ).toEqual([
      ["a-15.m4s", 56, 4],
      ["a-16.m4s", 60, 0.03],
      ["b-1.m4s", 60.03, 4],
      ["b-2.m4s", 64.03, 4],
      ["b-3.m4s", 68.03, 4],
      ["b-4.m4s", 72.03, 4],
    ]);

    // The 30 ms tail has no ID of its own; every shared segment has one.
    const registry = new ManifestRegistry();
    registry.apply(parsed);
    const ids = Array.from(registry.getStream("v")?.segments.values() ?? [])
      .filter((s) => s.startTime >= 56)
      .map((s) => [s.url.split("/").pop(), s.externalId]);
    expect(ids).toEqual([
      ["a-15.m4s", 560],
      ["b-1.m4s", 600],
      ["b-2.m4s", 640],
      ["b-3.m4s", 680],
      ["b-4.m4s", 720],
    ]);
  });

  it("leaves out a short segment whose end and the next start round apart", () => {
    // The 134-tick segment starts at 2328.53953125 s. Its end, computed as
    // start + duration, is 2328.55: 23285.5 rounds up, to a unit of its own.
    // The parser computes the next start on its own, 2328.5499999999997,
    // which rounds to 23285: the short segment's ID.
    const mpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-live:2011" type="static" mediaPresentationDuration="PT2400S" minBufferTime="PT2S">
  <Period id="p0" start="PT0.1S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v" bandwidth="1000000" codecs="avc1.4d401f">
        <SegmentTemplate media="v-$Time$.m4s" initialization="v-init.mp4" timescale="12800">
          <SegmentTimeline>
            <S t="29791226" d="12800"/>
            <S d="134"/>
            <S d="12800"/>
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const registry = new ManifestRegistry();
    registry.apply(dashManifestParser.parse(mpd, URL));
    const segments = Array.from(
      registry.getStream("v")?.segments.values() ?? [],
    );
    expect(segments.map((s) => s.url.split("/").pop())).toEqual([
      "v-29791226.m4s",
      "v-29804160.m4s",
    ]);
    const ids = segments.map((s) => s.externalId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the whole file of a live SegmentBase stream with no index range", () => {
    // The parser gives that one segment no duration: nothing to judge its
    // ID by, and it is its stream's only segment.
    const mpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z" minBufferTime="PT2S">
  <Period id="p0" start="PT0S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v" bandwidth="1000000" codecs="avc1.4d401f">
        <BaseURL>v.mp4</BaseURL>
        <SegmentBase><Initialization range="0-799"/></SegmentBase>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const registry = new ManifestRegistry();
    registry.apply(dashManifestParser.parse(mpd, URL, { now: 80_000 }));
    const [segment] = registry.getStream("v")?.segments.values() ?? [];
    expect(segment).toMatchObject({ externalId: 0, startTime: 0 });
  });

  it("clips a segment that starts before its period to the period start", () => {
    // p1's first segment starts at 59.92 s, before p1 at 60.03 s (S@t below
    // presentationTimeOffset). p0's 59.90 s segment, cut at 60.03 s, keeps
    // unit 599; clipped, p1's first takes 600, not 599 too. p0's 61.8 s
    // segment lies after p0 and is left out.
    const mpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-live:2011" type="static" mediaPresentationDuration="PT70S" minBufferTime="PT2S">
  <Period id="p0" start="PT0S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v" bandwidth="1000000" codecs="avc1.4d401f">
        <SegmentTemplate media="a-$Time$.m4s" initialization="a-init.mp4" timescale="1000">
          <SegmentTimeline>
            <S t="57900" d="2000"/>
            <S d="1900"/>
            <S d="2000"/>
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
  <Period id="p1" start="PT60.03S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v" bandwidth="1000000" codecs="avc1.4d401f">
        <SegmentTemplate media="b-$Time$.m4s" initialization="b-init.mp4" timescale="1000" presentationTimeOffset="60030">
          <SegmentTimeline>
            <S t="59920" d="2000" r="2"/>
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const parsed = dashManifestParser.parse(mpd, URL);
    const registry = new ManifestRegistry();
    registry.apply(parsed);
    const ids = Array.from(registry.getStream("v")?.segments.values() ?? [])
      .filter((s) => s.startTime >= 59)
      .map((s) => [s.url.split("/").pop(), s.externalId]);
    expect(ids).toEqual([
      ["a-59900.m4s", 599],
      ["b-59920.m4s", 600],
      // 60.03 s + (61920 − 60030) / 1000 = 61.92 s.
      ["b-61920.m4s", 619],
      ["b-63920.m4s", 639],
    ]);
  });

  it("leaves out a segment that starts at the next period's start, in float", () => {
    // 2.002 s segments from 10.01 s, and p1 on their grid at 60.06 s. The
    // parser puts a-26 at 60.059999999999995, a few float steps below p1's
    // start: no media of p0, not a 7e-15 s sliver of it.
    const mpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-live:2011" type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z" minimumUpdatePeriod="PT2S" timeShiftBufferDepth="PT120S" minBufferTime="PT2S">
  <Period id="p0" start="PT10.01S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v" bandwidth="1000000" codecs="avc1.4d401f">
        <SegmentTemplate media="a-$Number$.m4s" initialization="a-init.mp4" duration="60060" timescale="30000" startNumber="1"/>
      </Representation>
    </AdaptationSet>
  </Period>
  <Period id="p1" start="PT60.06S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v" bandwidth="1000000" codecs="avc1.4d401f">
        <SegmentTemplate media="b-$Number$.m4s" initialization="b-init.mp4" duration="60060" timescale="30000" startNumber="1"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const [stream] = dashManifestParser.parse(mpd, URL, {
      now: 80_000,
    }).streams;
    const urls = (stream.segments ?? []).map((s) => s.url.split("/").pop());
    expect(urls).toContain("a-25.m4s");
    expect(urls).not.toContain("a-26.m4s");
    expect((stream.segments ?? []).every((s) => s.duration > 0.001)).toBe(true);
  });

  it("leaves out a segment that ends at its period start, in float", () => {
    // Period at 10.01 s, presentationTimeOffset 128128 at 12800 per second.
    // The first S ends there, but the parser's start, 10.01 − 1.0010156 s,
    // plus the duration is 1.8e-15 s past 10.01: no media of the period, not
    // a sliver of it.
    const mpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-live:2011" type="static" mediaPresentationDuration="PT60S" minBufferTime="PT2S">
  <Period id="p0" start="PT10.01S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v" bandwidth="1000000" codecs="avc1.4d401f">
        <SegmentTemplate media="v-$Time$.m4s" initialization="v-init.mp4" timescale="12800" presentationTimeOffset="128128">
          <SegmentTimeline>
            <S t="115315" d="12813" r="2"/>
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const [stream] = dashManifestParser.parse(mpd, URL).streams;
    expect((stream.segments ?? []).map((s) => s.url.split("/").pop())).toEqual([
      "v-128128.m4s",
      "v-140941.m4s",
    ]);
  });

  it("leaves out a segment that ends at or before its period start", () => {
    // The period starts at 60 s (presentationTimeOffset 60000): the first S
    // ends at 59 s and the second at 60 s, no media of the period.
    const mpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-live:2011" type="static" mediaPresentationDuration="PT70S" minBufferTime="PT2S">
  <Period id="p0" start="PT60S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v" bandwidth="1000000" codecs="avc1.4d401f">
        <SegmentTemplate media="v-$Time$.m4s" initialization="v-init.mp4" timescale="1000" presentationTimeOffset="60000">
          <SegmentTimeline>
            <S t="57000" d="2000"/>
            <S d="1000"/>
            <S d="2000" r="1"/>
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const [stream] = dashManifestParser.parse(mpd, URL).streams;
    expect(
      stream.segments?.map((s) => [s.url.split("/").pop(), s.presentationTime]),
    ).toEqual([
      ["v-60000.m4s", 60],
      ["v-62000.m4s", 62],
    ]);
  });

  it("ends a live period at its Period@duration before the next one is listed", () => {
    // p0 is the last period the MPD lists, and says it ends at 60.03 s: a-16
    // (60.00 s) has 30 ms, no ID of its own; a-17 and later are past the end
    // and left out.
    const mpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-live:2011" type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z" minimumUpdatePeriod="PT2S" timeShiftBufferDepth="PT120S" minBufferTime="PT2S">
  <Period id="p0" start="PT0S" duration="PT60.03S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v" bandwidth="1000000" codecs="avc1.4d401f">
        <SegmentTemplate media="a-$Number$.m4s" initialization="a-init.mp4" duration="4" timescale="1" startNumber="1"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
    const registry = new ManifestRegistry();
    registry.apply(dashManifestParser.parse(mpd, URL, { now: 80_000 }));
    const urls = Array.from(
      registry.getStream("v")?.segments.values() ?? [],
    ).map((s) => s.url.split("/").pop());
    expect(urls.slice(-2)).toEqual(["a-14.m4s", "a-15.m4s"]);
    expect(
      registry.isPassThroughSegment(
        segmentKey("https://cdn.example/dash/a-16.m4s"),
      ),
    ).toBe(true);
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
    // An audio rendition's bitrate is 0, as players report it; the
    // Representation id is the rendition's stable name.
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

  it("declares the window of a numbered template, which its span does not measure", () => {
    // At 100 s the list spans 56 s, at 104.5 s 64 s; the window is 60 s.
    for (const seconds of [100, 104.5]) {
      for (const stream of at(seconds).streams) {
        expect(stream.declaredWindow).toBe(60);
      }
    }
    // Less than a window after the period began, the window is that time.
    expect(at(30).streams[0].declaredWindow).toBe(30);
    // A list the MPD spells out has a span that is its window.
    const timeline = dashManifestParser.parse(
      DASH_SEGMENT_TIMELINE_DYNAMIC,
      URL,
    );
    expect(timeline.streams[0].declaredWindow).toBeUndefined();
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
