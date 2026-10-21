import { describe, expect, it, vi } from "vitest";
import { Core } from "../src/core.js";
import { HybridLoader } from "../src/hybrid-loader.js";
import { hlsManifestParser } from "../src/manifest/hls.js";
import { computeInfoHash } from "../src/stream-identity.js";
import { CoreConfig, StreamIdBuilderContext } from "../src/types.js";
import {
  HLS_LIVE_NO_PDT_REFRESH_1,
  HLS_LIVE_NO_PDT_REFRESH_2,
  HLS_MASTER_WITH_AUDIO,
  HLS_MASTER_WITH_VIDEO_RENDITIONS,
  HLS_MEDIA_VOD_BYTERANGE,
} from "./fixtures/index.js";

const MANIFEST_URL = "https://example.com/hls/master.m3u8";
const VIDEO_1080 = "https://example.com/hls/video/1080p/index.m3u8";
const VIDEO_360 = "https://example.com/hls/video/360p/index.m3u8";
const AUDIO_EN = "https://example.com/hls/audio/en/index.m3u8";
const AUDIO_DE = "https://example.com/hls/audio/de/index.m3u8";
const MEDIA_URL = "https://cdn.example/vod/index.m3u8";

// The 1080p variant is the first of HLS_MASTER_WITH_AUDIO: `main0`. The
// infohash is the golden vector's of stream-identity.test.ts.
const INFOHASH_1080 = "W1b9WgA8SSH2c5Dblnh5";

/** Streams enter the core only through manifests. */
function createCore(config?: Partial<CoreConfig>) {
  const core = new Core({ ...config, manifestParsers: [hlsManifestParser] });
  core.processManifest({
    url: `${MANIFEST_URL}?token=abc`,
    data: HLS_MASTER_WITH_AUDIO,
  });
  return core;
}

describe("stream registration from manifests", () => {
  it("registers every variant and rendition the master declares, in order", () => {
    const core = createCore();
    expect(core.getStreams().map((s) => [s.runtimeId, s.type])).toEqual([
      [VIDEO_1080, "main"],
      [VIDEO_360, "main"],
      [AUDIO_EN, "secondary"],
      [AUDIO_DE, "secondary"],
    ]);
  });

  it("computes the default identity matching the golden vectors", () => {
    const stream = createCore().getStream(VIDEO_1080);
    expect(stream).toBeDefined();
    expect(stream?.swarmId).toBe(MANIFEST_URL); // query parameters stripped
    expect(stream?.streamId).toBe("main0");
    expect(stream?.streamSwarmId).toBe(`v3-${MANIFEST_URL}-main0`);
    expect(stream?.infoHash).toBe(INFOHASH_1080);
    // Each stream is its type and its index among the master's streams of
    // that type.
    expect(
      createCore()
        .getStreams()
        .map((s) => s.streamId),
    ).toEqual(["main0", "main1", "secondary0", "secondary1"]);
  });

  it("counts alternate video renditions as main streams, after the variants", () => {
    const core = new Core({ manifestParsers: [hlsManifestParser] });
    core.processManifest({
      url: MANIFEST_URL,
      data: HLS_MASTER_WITH_VIDEO_RENDITIONS,
    });
    expect(core.getStreams().map((s) => [s.runtimeId, s.streamId])).toEqual([
      [VIDEO_1080, "main0"],
      ["https://example.com/hls/video/720p/index.m3u8", "main1"],
      ["https://example.com/hls/video/1080p/wide.m3u8", "main2"],
      ["https://example.com/hls/video/720p/wide.m3u8", "main3"],
    ]);
  });

  it("names the swarm after the first manifest unless told otherwise", () => {
    const core = new Core({ manifestParsers: [hlsManifestParser] });
    core.setManifestResponseUrl("https://origin.example/master.m3u8?sig=1");
    core.processManifest({ url: MANIFEST_URL, data: HLS_MASTER_WITH_AUDIO });
    expect(core.getStream(VIDEO_1080)?.swarmId).toBe(
      "https://origin.example/master.m3u8",
    );
  });

  it("prefers the configured swarmId over the manifest URL", () => {
    const stream = createCore({ swarmId: "my-swarm" }).getStream(VIDEO_1080);
    expect(stream?.swarmId).toBe("my-swarm");
    expect(stream?.streamSwarmId).toBe("v3-my-swarm-main0");
    expect(stream?.infoHash).toBe(computeInfoHash("v3-my-swarm-main0"));
  });

  it("composes the stream swarm ID from the streamIdBuilder output", () => {
    const contexts: StreamIdBuilderContext[] = [];
    const core = createCore({
      streamIdBuilder: (context) => {
        contexts.push(context);
        return `custom-${context.defaultStreamId}`;
      },
    });

    const stream = core.getStream(VIDEO_1080);
    expect(stream?.streamId).toBe("custom-main0");
    expect(stream?.streamSwarmId).toBe(`v3-${MANIFEST_URL}-custom-main0`);
    expect(stream?.infoHash).toBe(
      computeInfoHash(`v3-${MANIFEST_URL}-custom-main0`),
    );

    expect(contexts.map((c) => c.defaultStreamId)).toEqual([
      "main0",
      "main1",
      "secondary0",
      "secondary1",
    ]);
    const [context] = contexts;
    expect(context).toMatchObject({
      swarmId: MANIFEST_URL,
      runtimeId: VIDEO_1080,
      streamType: "main",
      defaultStreamId: "main0",
      index: 0,
    });
    expect(context.properties).toMatchObject({
      bitrate: 4521000,
      width: 1920,
      height: 1080,
    });
    // The whole manifest, so that a builder can tell what the ID must be
    // unique among.
    expect(context.manifest?.url).toBe(`${MANIFEST_URL}?token=abc`);
    expect(
      context.manifest?.streams.map((s) => [
        s.streamType,
        s.defaultStreamId,
        s.index,
      ]),
    ).toEqual([
      ["main", "main0", 0],
      ["main", "main1", 1],
      ["secondary", "secondary0", 0],
      ["secondary", "secondary1", 1],
    ]);
    expect(context.manifest?.streams[3].properties.language).toBe("de");
    // The playlist URLs too: an unsigned file name can tell apart rungs that
    // differ only in a bitrate the origin rewrites.
    expect(context.manifest?.streams.map((s) => s.runtimeId)).toEqual([
      VIDEO_1080,
      VIDEO_360,
      AUDIO_EN,
      AUDIO_DE,
    ]);
  });

  it("falls back to the default derivation when the builder returns undefined", () => {
    const core = createCore({ streamIdBuilder: () => undefined });
    expect(core.getStream(VIDEO_1080)?.infoHash).toBe(INFOHASH_1080);
  });

  it("reports a builder that returns an empty or non-string value, once per stream", () => {
    for (const builderResult of ["", 42 as unknown as string]) {
      const core = new Core({
        manifestParsers: [hlsManifestParser],
        streamIdBuilder: () => builderResult,
      });
      const onRegistrationError = vi.fn();
      core.addEventListener("onStreamRegistrationError", onRegistrationError);

      core.processManifest({ url: MANIFEST_URL, data: HLS_MASTER_WITH_AUDIO });
      // A refresh must not report the same failures again.
      core.processManifest({ url: MANIFEST_URL, data: HLS_MASTER_WITH_AUDIO });

      expect(core.getStreams()).toEqual([]);
      expect(onRegistrationError).toHaveBeenCalledTimes(4);
      const { error } = onRegistrationError.mock.calls[0][0] as {
        error: Error;
      };
      expect(error.message).toMatch(/non-empty string/);
    }
  });

  it("does not check that a builder's IDs are unique", () => {
    // The integrator's contract: a builder that gives different streams one
    // ID puts them in one swarm, and the core registers them as it is told.
    const onRegistrationError = vi.fn();
    const core = new Core({
      manifestParsers: [hlsManifestParser],
      streamIdBuilder: () => "same-key",
    });
    core.addEventListener("onStreamRegistrationError", onRegistrationError);
    core.processManifest({ url: MANIFEST_URL, data: HLS_MASTER_WITH_AUDIO });

    expect(onRegistrationError).not.toHaveBeenCalled();
    expect(core.getStreams()).toHaveLength(4);
    expect(new Set(core.getStreams().map((s) => s.streamSwarmId))).toEqual(
      new Set([`v3-${MANIFEST_URL}-same-key`]),
    );
  });

  it("puts one stream from two masters of one configured swarm in one swarm", () => {
    // The same content behind two CDNs, named by one swarmId: each master's
    // first variant is `main0`, and the same stream.
    const onRegistrationError = vi.fn();
    const core = new Core({
      manifestParsers: [hlsManifestParser],
      swarmId: "content-42",
    });
    core.addEventListener("onStreamRegistrationError", onRegistrationError);
    core.processManifest({
      url: "https://cdn-a.example/master.m3u8",
      data: HLS_MASTER_WITH_AUDIO,
    });
    core.processManifest({
      url: "https://cdn-b.example/master.m3u8",
      data: HLS_MASTER_WITH_AUDIO,
    });

    expect(onRegistrationError).not.toHaveBeenCalled();
    expect(
      core.getStream("https://cdn-a.example/video/1080p/index.m3u8"),
    ).toEqual(
      expect.objectContaining({ streamSwarmId: "v3-content-42-main0" }),
    );
    expect(
      core.getStream("https://cdn-b.example/video/1080p/index.m3u8"),
    ).toEqual(
      expect.objectContaining({ streamSwarmId: "v3-content-42-main0" }),
    );
  });

  it("registers a stream only once and fires onStreamAdded once", () => {
    const core = new Core({ manifestParsers: [hlsManifestParser] });
    const onStreamAdded = vi.fn();
    core.addEventListener("onStreamAdded", onStreamAdded);

    core.processManifest({ url: MANIFEST_URL, data: HLS_MASTER_WITH_AUDIO });
    core.processManifest({ url: MANIFEST_URL, data: HLS_MASTER_WITH_AUDIO });

    expect(onStreamAdded).toHaveBeenCalledTimes(4);
    const { stream } = onStreamAdded.mock.calls[0][0];
    expect(stream.infoHash).toBe(INFOHASH_1080);

    // The payload is a snapshot of the registered stream's identity,
    // detached from the core's internal stream state.
    const registered = core.getStream(VIDEO_1080);
    expect(stream).not.toBe(registered);
    expect("segments" in stream).toBe(false);
    expect(stream).toEqual(registered);
  });

  it("freezes stream properties at registration", () => {
    const stream = createCore().getStream(VIDEO_1080);
    expect(Object.isFrozen(stream?.properties)).toBe(true);
  });

  it("returns detached snapshots from getStream and getStreams", () => {
    const core = createCore();
    const fromGetStream = core.getStream(VIDEO_1080);
    const fromGetStreams = core.getStreams()[0];

    // No path into the core's internal segment registry.
    expect(fromGetStream && "segments" in fromGetStream).toBe(false);
    expect("segments" in fromGetStreams).toBe(false);

    // A fresh snapshot per call: equal by value, not shared by reference.
    expect(fromGetStream).not.toBe(core.getStream(VIDEO_1080));
    expect(fromGetStream).toEqual(core.getStream(VIDEO_1080));
    expect(fromGetStreams).not.toBe(fromGetStream);
    expect(fromGetStreams).toEqual(fromGetStream);
  });

  it("forgets everything on destroy", () => {
    const core = createCore();
    core.destroy();
    expect(core.getStreams()).toEqual([]);
  });
});

describe("segment lookup", () => {
  const MEDIA_MP4 = "https://cdn.example/vod/media.mp4";
  const INIT_MP4 = "https://cdn.example/vod/init.mp4";

  function createVodCore(config?: Partial<CoreConfig>) {
    const core = new Core({ ...config, manifestParsers: [hlsManifestParser] });
    core.processManifest({ url: MEDIA_URL, data: HLS_MEDIA_VOD_BYTERANGE });
    return core;
  }

  it("resolves a request by URL and inclusive byte range", () => {
    const core = createVodCore();
    expect(core.hasSegment(MEDIA_MP4, { start: 600, end: 1599 })).toBe(true);
    expect(core.isSegmentLoadable(MEDIA_MP4, { start: 600, end: 1599 })).toBe(
      true,
    );
    // The range is part of the key: the same file at another offset is
    // another segment, and the whole file is nothing the registry knows.
    expect(core.hasSegment(MEDIA_MP4, { start: 600, end: 1600 })).toBe(false);
    expect(core.hasSegment(MEDIA_MP4)).toBe(false);
  });

  it("ignores a telemetry query parameter the player appended", () => {
    const core = createVodCore();
    expect(
      core.isSegmentLoadable(`${MEDIA_MP4}?CMCD=bl%3D2000`, {
        start: 600,
        end: 1599,
      }),
    ).toBe(true);
  });

  it("reports a miss for an unknown URL, but not for an initialization segment", () => {
    const core = createVodCore();
    const onMiss = vi.fn();
    core.addEventListener("onSegmentRegistryMiss", onMiss);

    expect(core.isSegmentLoadable(INIT_MP4, { start: 0, end: 599 })).toBe(
      false,
    );
    expect(onMiss).not.toHaveBeenCalled();

    expect(
      core.isSegmentLoadable("https://cdn.example/vod/other.mp4", {
        start: 0,
        end: 99,
      }),
    ).toBe(false);
    expect(onMiss).toHaveBeenCalledTimes(1);
    expect(onMiss.mock.calls[0][0]).toEqual({
      url: "https://cdn.example/vod/other.mp4",
      byteRange: { start: 0, end: 99 },
    });
  });

  it("names the swarm by what was asked for, not by where the CDN answered", () => {
    // Every viewer asks for the same URL; a CDN may answer each from its own.
    const core = new Core({ manifestParsers: [hlsManifestParser] });
    core.processManifest({
      url: "https://edge7.example/x/aaa/index.m3u8",
      requestedUrl: MEDIA_URL,
      data: HLS_MEDIA_VOD_BYTERANGE,
    });
    expect(core.getStreams()[0].swarmId).toBe(MEDIA_URL);
  });

  it("shares a media playlist loaded on its own, which is the whole stream", () => {
    const core = createVodCore();
    expect(core.getStreams()).toHaveLength(1);
    expect(core.isSegmentLoadable(MEDIA_MP4, { start: 600, end: 1599 })).toBe(
      true,
    );
  });

  it("keeps the anonymous identity of a stream whose master came after it", () => {
    // A media playlist processed before its master: not an order any player
    // produces, and not supported. The identity is the first registration's,
    // and beside the master's other variants the stream stops sharing — the
    // rule for every anonymous stream that is not alone of its type.
    const core = new Core({ manifestParsers: [hlsManifestParser] });
    core.processManifest({ url: VIDEO_1080, data: HLS_MEDIA_VOD_BYTERANGE });
    const anonymous = core.getStreams()[0];
    expect(
      core.isSegmentLoadable("https://example.com/hls/video/1080p/media.mp4", {
        start: 600,
        end: 1599,
      }),
    ).toBe(true);

    core.processManifest({ url: MANIFEST_URL, data: HLS_MASTER_WITH_AUDIO });

    const stream = core.getStream(VIDEO_1080)!;
    expect(anonymous.streamId).toBe("main");
    expect(stream.streamId).toBe("main");
    expect(
      core.isSegmentLoadable("https://example.com/hls/video/1080p/media.mp4", {
        start: 600,
        end: 1599,
      }),
    ).toBe(false);
  });

  it("refuses to share a stream no manifest identified beside ones it did", () => {
    // A rendition whose media playlist the registry could not match to the
    // master that named it — a CDN signing playlist URLs per response is
    // enough. It carries the ID every unidentified stream carries, so
    // peers would exchange segments of different renditions by number.
    const core = new Core({ manifestParsers: [hlsManifestParser] });
    core.processManifest({ url: MEDIA_URL, data: HLS_MEDIA_VOD_BYTERANGE });
    expect(core.isSegmentLoadable(MEDIA_MP4, { start: 600, end: 1599 })).toBe(
      true,
    );

    core.processManifest({
      url: "https://cdn.example/vod/master.m3u8",
      data: HLS_MASTER_WITH_AUDIO,
    });

    expect(core.getStreams().length).toBeGreaterThan(1);
    expect(core.hasSegment(MEDIA_MP4, { start: 600, end: 1599 })).toBe(true);
    expect(core.isSegmentLoadable(MEDIA_MP4, { start: 600, end: 1599 })).toBe(
      false,
    );
  });

  it("recognises every initialization segment a playlist lists", () => {
    // A discontinuity introduces a second one; a request for it is not a
    // miss just because it is not the first.
    const core = new Core({ manifestParsers: [hlsManifestParser] });
    core.processManifest({
      url: MEDIA_URL,
      data: `${HLS_MEDIA_VOD_BYTERANGE.replace("#EXT-X-ENDLIST", "")}#EXT-X-DISCONTINUITY
#EXT-X-MAP:URI="init-2.mp4"
#EXTINF:6.0,
#EXT-X-BYTERANGE:800@3600
media.mp4
#EXT-X-ENDLIST
`,
    });
    const onMiss = vi.fn();
    core.addEventListener("onSegmentRegistryMiss", onMiss);

    // The first is a byte range of a file, the second a file of its own.
    expect(core.isSegmentLoadable(INIT_MP4, { start: 0, end: 599 })).toBe(
      false,
    );
    expect(core.isSegmentLoadable("https://cdn.example/vod/init-2.mp4")).toBe(
      false,
    );
    expect(onMiss).not.toHaveBeenCalled();
  });

  it("stops recognising an initialization segment the manifest has replaced", () => {
    const core = createVodCore();
    const onMiss = vi.fn();
    core.addEventListener("onSegmentRegistryMiss", onMiss);
    expect(core.isSegmentLoadable(INIT_MP4, { start: 0, end: 599 })).toBe(
      false,
    );
    expect(onMiss).not.toHaveBeenCalled();

    // A discontinuity, a new period or an ad break rotates it. The registry
    // holds the one the stream declares now, and the core asks rather than
    // remembering every key it ever saw.
    core.processManifest({
      url: MEDIA_URL,
      data: HLS_MEDIA_VOD_BYTERANGE.replace(
        'URI="init.mp4"',
        'URI="init-2.mp4"',
      ),
    });

    expect(
      core.isSegmentLoadable("https://cdn.example/vod/init-2.mp4", {
        start: 0,
        end: 599,
      }),
    ).toBe(false);
    expect(onMiss).not.toHaveBeenCalled();

    expect(core.isSegmentLoadable(INIT_MP4, { start: 0, end: 599 })).toBe(
      false,
    );
    expect(onMiss).toHaveBeenCalledTimes(1);
  });

  it("recognises an initialization segment whose byte range has no offset", () => {
    // `EXT-X-MAP:BYTERANGE="600"` — a bare length. Read as no range at all,
    // the key would carry NaN, match nothing the player ever asks for, and
    // report a miss for every initialization request.
    const core = new Core({ manifestParsers: [hlsManifestParser] });
    core.processManifest({
      url: MEDIA_URL,
      data: HLS_MEDIA_VOD_BYTERANGE.replace(
        'BYTERANGE="600@0"',
        'BYTERANGE="600"',
      ),
    });
    const onMiss = vi.fn();
    core.addEventListener("onSegmentRegistryMiss", onMiss);

    expect(core.isSegmentLoadable(INIT_MP4, { start: 0, end: 599 })).toBe(
      false,
    );
    expect(onMiss).not.toHaveBeenCalled();
  });

  it("refuses a known segment when P2P is disabled for its stream type, without a miss", () => {
    const core = createVodCore({ mainStream: { isP2PDisabled: true } });
    const onMiss = vi.fn();
    core.addEventListener("onSegmentRegistryMiss", onMiss);

    expect(core.hasSegment(MEDIA_MP4, { start: 600, end: 1599 })).toBe(true);
    expect(core.isSegmentLoadable(MEDIA_MP4, { start: 600, end: 1599 })).toBe(
      false,
    );
    expect(onMiss).not.toHaveBeenCalled();
  });

  it("supports the swarmId-only configuration end to end", () => {
    // A custom integration may configure swarmId; the manifest URL is then
    // never consulted for identity, but segments must still be loadable.
    const core = createVodCore({ swarmId: "my-swarm" });
    expect(core.getStream(MEDIA_URL)?.swarmId).toBe("my-swarm");
    expect(core.isSegmentLoadable(MEDIA_MP4, { start: 600, end: 1599 })).toBe(
      true,
    );
  });

  it("follows a sliding live window and keeps the stream's identity", () => {
    const core = new Core({ manifestParsers: [hlsManifestParser] });
    const url = "https://cdn.example/live/index.m3u8";
    core.processManifest({ url, data: HLS_LIVE_NO_PDT_REFRESH_1 });
    const infoHashBefore = core.getStream(url)?.infoHash;
    expect(core.hasSegment("https://cdn.example/live/seg100.ts")).toBe(true);

    core.processManifest({ url, data: HLS_LIVE_NO_PDT_REFRESH_2 });
    expect(core.hasSegment("https://cdn.example/live/seg100.ts")).toBe(false);
    expect(core.hasSegment("https://cdn.example/live/seg106.ts")).toBe(true);
    expect(core.getStream(url)?.infoHash).toBe(infoHashBefore);
  });

  it("derives the live state from the manifest", () => {
    const peek = (core: Core) =>
      (core as unknown as { streamDetails: { isLive: boolean } }).streamDetails
        .isLive;

    const live = new Core({ manifestParsers: [hlsManifestParser] });
    live.processManifest({
      url: "https://cdn.example/live/index.m3u8",
      data: HLS_LIVE_NO_PDT_REFRESH_1,
    });
    expect(peek(live)).toBe(true);

    expect(peek(createVodCore())).toBe(false);
  });

  it("rejects loading a segment the registry does not know", async () => {
    const core = createVodCore();
    await expect(
      core.loadSegment("https://cdn.example/vod/other.mp4"),
    ).rejects.toThrow(/not in the registry/);
  });

  /**
   * A core whose segment storage stays half-initialized until the test
   * releases it: the window in which a request has entered `loadSegment` and
   * has no loader to carry an abort.
   */
  function createCoreWithHeldStorage() {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const storage = {
      initialize: () => held,
      setSegmentChangeCallback: () => undefined,
      hasSegment: () => false,
      getSegmentData: () => Promise.resolve(undefined),
      onSegmentRequested: () => undefined,
      onPlaybackUpdated: () => undefined,
      storeSegment: () => Promise.resolve(),
      getUsage: () => ({ totalCapacity: 100, usedCapacity: 0 }),
      destroy: () => undefined,
    };
    const core = createVodCore({
      customSegmentStorageFactory: () => storage as never,
    });
    return { core, release };
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("aborts a request that is still waiting for the segment storage", async () => {
    const { core, release } = createCoreWithHeldStorage();
    const byteRange = { start: 600, end: 1599 };
    const loading = core.loadSegment(MEDIA_MP4, { byteRange });
    await settle();

    // No loader exists yet to carry the abort; the request takes it itself.
    core.abortSegmentLoading(MEDIA_MP4, byteRange);
    release();
    await expect(loading).rejects.toMatchObject({ type: "aborted" });
  });

  it("aborts requests waiting for the segment storage when the core is destroyed", async () => {
    const { core, release } = createCoreWithHeldStorage();
    const byteRange = { start: 600, end: 1599 };
    const loading = core.loadSegment(MEDIA_MP4, { byteRange });
    await settle();

    core.destroy();
    release();
    await expect(loading).rejects.toMatchObject({ type: "aborted" });
  });

  it("fails a request whose storage throws as it starts, rather than hanging it", async () => {
    // A custom storage is the integrator's code; whatever it does, the
    // request has to settle, or the player waits on a promise for ever.
    const storage = {
      initialize: () => Promise.resolve(),
      setSegmentChangeCallback: () => undefined,
      onSegmentRequested: () => {
        throw new Error("storage is broken");
      },
      hasSegment: () => false,
      getSegmentData: () => Promise.resolve(undefined),
      getStoredSegmentIds: () => [],
      onPlaybackUpdated: () => undefined,
      storeSegment: () => Promise.resolve(),
      getUsage: () => ({ totalCapacity: 100, usedCapacity: 0 }),
      destroy: () => undefined,
    };
    const core = createVodCore({
      customSegmentStorageFactory: () => storage as never,
    });
    // HybridLoader schedules its prefetch timer on `window`.
    vi.stubGlobal("window", globalThis);

    const outcome = await Promise.race([
      core
        .loadSegment(MEDIA_MP4, { byteRange: { start: 600, end: 1599 } })
        .then(
          () => "resolved" as unknown,
          (error: unknown) => error,
        ),
      new Promise((resolve) => setTimeout(() => resolve("never settled"), 200)),
    ]);
    expect(outcome).toMatchObject({ type: "failed" });
    vi.unstubAllGlobals();
    core.destroy();
  });

  it("fails a request whose loader throws before it can report anything", async () => {
    // The backstop for a throw no loader handled: without it the promise
    // stays pending and the abort listener stays on the signal.
    const core = createVodCore();
    vi.stubGlobal("window", globalThis);
    vi.spyOn(HybridLoader.prototype, "loadSegment").mockRejectedValueOnce(
      new Error("loader is broken"),
    );

    await expect(
      core.loadSegment(MEDIA_MP4, { byteRange: { start: 600, end: 1599 } }),
    ).rejects.toMatchObject({ type: "failed" });

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    core.destroy();
  });

  it("rejects an already-aborted load before touching any loader", async () => {
    const core = createVodCore();
    const controller = new AbortController();
    controller.abort();
    await expect(
      core.loadSegment(MEDIA_MP4, {
        byteRange: { start: 600, end: 1599 },
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ type: "aborted" });
  });
});
