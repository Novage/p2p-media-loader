import { describe, expect, it, vi } from "vitest";
import type { HlsConfig } from "hls.js";
import { debug } from "p2p-media-loader-core";
import { HlsJsP2PEngine } from "../src/engine.js";
import { injectMixin } from "../src/engine-static.js";
import { diagnostics as compiledLedger } from "../src/diagnostics.js";

// Absent only in a prebuilt bundle; the tests run on the source.
if (!compiledLedger) throw new Error("diagnostics are compiled out");
const ledger = compiledLedger;
// The ledger decides once, at its first record: on, for the whole file.
debug.enable("p2pml:diagnostics");
ledger.snapshot();
debug.disable();

const count = (name: string) => ledger.snapshot()?.counters[name] ?? 0;

/**
 * A stand-in for the HLS.js instance: enough surface for the engine to bind
 * its event handlers and tune live sync, mirroring how HLS.js's own
 * `targetLatency` setter writes `config.liveSyncDuration`.
 */
function createFakeHls() {
  const handlers = new Map<string, (event: string, data: unknown) => void>();
  const hls = {
    handlers,
    targetLatencySets: 0,
    userConfig: {} as Record<string, unknown>,
    config: {
      liveSyncDuration: undefined as number | undefined,
      liveSyncDurationCount: 3,
      liveMaxLatencyDuration: undefined as number | undefined,
      liveMaxLatencyDurationCount: Infinity,
      maxBufferLength: 30,
      maxMaxBufferLength: 600,
    },
    media: undefined,
    set targetLatency(value: number) {
      hls.targetLatencySets++;
      hls.config.liveSyncDuration = value;
    },
    on(event: string, handler: (event: string, data: unknown) => void) {
      handlers.set(event, handler);
    },
    off() {},
  };
  return hls;
}

const MASTER_URL = "https://cdn.example/live/master.m3u8";
const MEDIA_URL = "https://cdn.example/live/720p.m3u8";
const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720
720p.m3u8
`;

type PlaylistLoader = {
  load(context: unknown, config: unknown, callbacks: unknown): void;
};

/** The playlist loader each fake HLS.js was given, and its next sequence. */
const playlists = new WeakMap<
  object,
  { loader: PlaylistLoader; sequence: number }
>();

/** What HLS.js's own loader answers the next request with. */
let nextResponse: string | undefined;

class FakeLoader {
  stats = {};
  context = {};
  load(
    context: { url: string },
    _config: unknown,
    callbacks: { onSuccess: (...args: unknown[]) => void },
  ) {
    const data = nextResponse;
    nextResponse = undefined;
    if (data === undefined) return;
    callbacks.onSuccess({ url: context.url, data }, {}, context, null);
  }
  abort() {}
  destroy() {}
}

/**
 * Loads a playlist through the engine's playlist loader, as HLS.js does, and
 * calls `onRead` where HLS.js would read it.
 */
function respond(
  loader: PlaylistLoader,
  type: string,
  url: string,
  data: string,
  onRead: () => void = () => undefined,
) {
  nextResponse = data;
  loader.load({ type, url }, {}, { onSuccess: onRead });
}

/**
 * One refresh of the level playlist, as HLS.js goes through it: the playlist
 * is loaded — through the engine's loader, into the core — and then HLS.js
 * announces the level it parsed. Each refresh lists segments after the last
 * one's, so the timeline runs on.
 */
function levelUpdated(
  hls: ReturnType<typeof createFakeHls>,
  details: {
    live: boolean;
    totalduration: number;
    averagetargetduration?: number;
    targetduration?: number;
    /** How many fragments the playlist lists; by default, what fills the window. */
    fragments?: number;
  },
  options: { type?: string; onRead?: () => void } = {},
) {
  const segment = details.averagetargetduration ?? 2;
  const fragments =
    details.fragments ??
    Math.max(5, Math.round(details.totalduration / segment));
  const state = playlists.get(hls);
  if (!state) throw new Error("set up without a playlist loader");
  // Every segment the average, and the last one whatever makes the total.
  const durations = Array.from({ length: fragments }, (_, i) =>
    i < fragments - 1 ? segment : details.totalduration - segment * i,
  );
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${details.targetduration ?? 6}`,
    `#EXT-X-MEDIA-SEQUENCE:${state.sequence}`,
    ...durations.flatMap((duration, i) => [
      `#EXTINF:${duration.toFixed(3)},`,
      `seg${state.sequence + i}.ts`,
    ]),
    ...(details.live ? [] : ["#EXT-X-ENDLIST"]),
  ];
  state.sequence += fragments;
  respond(
    state.loader,
    options.type ?? "level",
    MEDIA_URL,
    `${lines.join("\n")}\n`,
    options.onRead,
  );

  fire(hls, "hlsLevelUpdated", {
    details: {
      live: details.live,
      totalduration: details.totalduration,
      targetduration: details.targetduration ?? 6,
      averagetargetduration: details.averagetargetduration,
      fragments: Array.from({ length: fragments }, () => ({ type: "main" })),
    },
  });
}

/**
 * Dispatches one HLS.js event to the handler the engine registered for it.
 * Looking the handler up and calling it optionally would pass silently for an
 * event the engine never registers, which is worth a failure: a test that
 * asserts nothing happened proves nothing if nothing was dispatched.
 */
function fire(
  hls: ReturnType<typeof createFakeHls>,
  event: string,
  data: unknown = {},
) {
  const handler = hls.handlers.get(event);
  if (!handler) {
    throw new Error(`the engine registered no handler for ${event}`);
  }
  handler(event, data);
}

function setup(config?: ConstructorParameters<typeof HlsJsP2PEngine>[0]) {
  const engine = new HlsJsP2PEngine(config);
  const hls = createFakeHls();
  engine.bindHls(hls);
  // The playlist loader's construction is where the engine attaches to HLS.js.
  const { pLoader } = engine.getConfigForHlsJs() as {
    pLoader: new (config: HlsConfig) => unknown;
  };
  const loader = new pLoader({
    loader: FakeLoader,
  } as unknown as HlsConfig) as PlaylistLoader;
  respond(loader, "manifest", MASTER_URL, MASTER);
  playlists.set(hls, { loader, sequence: 0 });
  return { engine, hls };
}

describe("HLS.js live window placement", () => {
  it("places the player one segment inside the tail, re-syncing two segments beyond", () => {
    const { hls } = setup();
    // A 28 s window of 2 s segments: target 26, re-sync past 30, and the
    // buffer a segment short of the target.
    levelUpdated(hls, {
      live: true,
      totalduration: 28,
      averagetargetduration: 2,
    });
    expect(hls.config.liveSyncDuration).toBe(26);
    expect(hls.config.liveMaxLatencyDuration).toBe(30);
    expect(hls.config.maxBufferLength).toBe(24);
    expect(hls.config.maxMaxBufferLength).toBe(24);
  });

  it("places the player before HLS.js reads the playlist it starts from", () => {
    // HLS.js picks a live stream's start while it reads the first playlist,
    // and 1.6 keeps it: a delay set any later would leave the player at
    // HLS.js's default, three target durations from the edge.
    const { hls } = setup();
    let delayAtRead: number | undefined;
    levelUpdated(
      hls,
      { live: true, totalduration: 28, averagetargetduration: 2 },
      { onRead: () => (delayAtRead = hls.config.liveSyncDuration) },
    );
    expect(delayAtRead).toBe(26);
  });

  it("is placed by the main level alone, not by an audio rendition's playlist", () => {
    const { hls } = setup();
    levelUpdated(hls, {
      live: true,
      totalduration: 28,
      averagetargetduration: 2,
    });
    levelUpdated(
      hls,
      { live: true, totalduration: 60, averagetargetduration: 2 },
      { type: "audioTrack" },
    );
    expect(hls.config.liveSyncDuration).toBe(26);
  });

  it("counts each placement it writes, and each it leaves to the integrator", () => {
    const applied = count("HlsPlacement:applied");
    const integrator = count("HlsPlacement:integrator");
    const { hls } = setup();
    levelUpdated(hls, {
      live: true,
      totalduration: 28,
      averagetargetduration: 2,
    });
    levelUpdated(hls, {
      live: true,
      totalduration: 28,
      averagetargetduration: 2,
    });
    expect(count("HlsPlacement:applied")).toBe(applied + 1);

    const configured = setup();
    configured.hls.userConfig.liveSyncDuration = 10;
    levelUpdated(configured.hls, {
      live: true,
      totalduration: 28,
      averagetargetduration: 2,
    });
    expect(count("HlsPlacement:integrator")).toBe(integrator + 1);
    expect(count("HlsPlacement:applied")).toBe(applied + 1);
  });

  it("tunes a four-segment playlist, the narrowest window with room in it", () => {
    const { hls } = setup();
    // Four 5 s segments: the playhead 15 s behind the edge and the buffer
    // 10 s ahead of it, so the core's window of half that leaves 5 s for
    // peers.
    levelUpdated(hls, {
      live: true,
      totalduration: 20,
      averagetargetduration: 5,
      fragments: 4,
    });
    expect(hls.config.liveSyncDuration).toBe(15);
    expect(hls.config.maxBufferLength).toBe(10);
  });

  it("leaves a three-segment playlist alone", () => {
    const { hls } = setup();
    levelUpdated(hls, {
      live: true,
      totalduration: 15,
      averagetargetduration: 5,
      fragments: 3,
    });
    expect(hls.config.liveSyncDuration).toBeUndefined();
    expect(hls.config.maxBufferLength).toBe(30);
  });

  it("sizes the live buffer from the window, not from a configured urgency threshold", () => {
    const { hls } = setup({ core: { urgentBufferThreshold: 3 } });
    levelUpdated(hls, {
      live: true,
      totalduration: 28,
      averagetargetduration: 2,
    });
    expect(hls.config.maxBufferLength).toBe(24);
  });

  it("gives the buffer back when the live window grows", () => {
    // A channel whose DVR window is still filling: four 5 s segments now,
    // five minutes of them later. Held at the narrow window's 10 s, the
    // player would buffer less than the 15 s urgency threshold the core uses
    // on the wide one, and every request would be urgent.
    const { hls } = setup();
    levelUpdated(hls, {
      live: true,
      totalduration: 20,
      averagetargetduration: 5,
      fragments: 4,
    });
    expect(hls.config.maxBufferLength).toBe(10);

    levelUpdated(hls, {
      live: true,
      totalduration: 300,
      averagetargetduration: 5,
    });
    expect(hls.config.liveSyncDuration).toBe(60);
    // The window asks for 55 s; HLS.js's own 30 s is the ceiling this engine
    // never raises past, and it is well clear of the urgency threshold.
    expect(hls.config.maxBufferLength).toBe(30);
    expect(hls.config.maxMaxBufferLength).toBe(55);
  });

  it("gives the buffer back when it lets the player go", () => {
    // An integrator who turns P2P off keeps the player. A ceiling left
    // behind would hold it to a live window it no longer has an engine for.
    const { hls, engine } = setup();
    levelUpdated(hls, {
      live: true,
      totalduration: 20,
      averagetargetduration: 5,
      fragments: 4,
    });
    expect(hls.config.maxBufferLength).toBe(10);
    expect(hls.config.maxMaxBufferLength).toBe(10);

    engine.destroy();

    expect(hls.config.maxBufferLength).toBe(30);
    expect(hls.config.maxMaxBufferLength).toBe(600);
  });

  it("leaves a buffer written from outside as it is when letting the player go", () => {
    const { hls, engine } = setup();
    levelUpdated(hls, {
      live: true,
      totalduration: 20,
      averagetargetduration: 5,
      fragments: 4,
    });
    // Their word, after this engine wrote its own.
    hls.config.maxBufferLength = 12;

    engine.destroy();

    expect(hls.config.maxBufferLength).toBe(12);
    expect(hls.config.maxMaxBufferLength).toBe(600);
  });

  it("brings a buffer raised from outside back down", () => {
    const { hls } = setup();
    levelUpdated(hls, {
      live: true,
      totalduration: 28,
      averagetargetduration: 2,
    });
    expect(hls.config.maxBufferLength).toBe(24);

    // Raised from outside while the window held still. A ceiling is only a
    // ceiling while it is enforced.
    hls.config.maxBufferLength = 40;
    levelUpdated(hls, {
      live: true,
      totalduration: 28,
      averagetargetduration: 2,
    });
    expect(hls.config.maxBufferLength).toBe(24);
  });

  it("keeps a buffer lowered from outside, and never raises past it", () => {
    const { hls } = setup();
    levelUpdated(hls, {
      live: true,
      totalduration: 28,
      averagetargetduration: 2,
    });

    // Below every ceiling this stream calls for: theirs, and kept — on the
    // window that prompted it and on the wider one after it.
    hls.config.maxBufferLength = 6;
    levelUpdated(hls, {
      live: true,
      totalduration: 28,
      averagetargetduration: 2,
    });
    expect(hls.config.maxBufferLength).toBe(6);

    levelUpdated(hls, {
      live: true,
      totalduration: 300,
      averagetargetduration: 5,
    });
    expect(hls.config.maxBufferLength).toBe(6);
  });

  it("sizes the VOD buffer by the widest window either stream actually uses", () => {
    // Only the main stream is configured; the secondary is left to derive,
    // which off live is the 15 s default. A buffer sized by the configured
    // number alone would make every audio request urgent.
    const { hls } = setup({
      core: { mainStream: { urgentBufferThreshold: 3 } },
    });
    levelUpdated(hls, {
      live: false,
      totalduration: 600,
      averagetargetduration: 2,
    });
    expect(hls.config.maxBufferLength).toBe(15);
  });

  it("holds the buffer to the urgency threshold off live", () => {
    // VOD: the core prefetches ahead of the player however far it buffers,
    // so the player is held to the threshold and the core does the rest.
    const { hls } = setup();
    levelUpdated(hls, {
      live: false,
      totalduration: 600,
      averagetargetduration: 2,
    });
    expect(hls.config.maxBufferLength).toBe(15);

    const configured = setup({ core: { urgentBufferThreshold: 20 } });
    levelUpdated(configured.hls, {
      live: false,
      totalduration: 600,
      averagetargetduration: 2,
    });
    expect(configured.hls.config.maxBufferLength).toBe(20);
  });

  it("never asks for more than a minute of latency, and leaves a DVR window to the viewer", () => {
    const { hls } = setup();
    levelUpdated(hls, {
      live: true,
      totalduration: 600,
      averagetargetduration: 6,
    });
    expect(hls.config.liveSyncDuration).toBe(60);
    // Two segments past the target would be 72 s, and HLS.js would pull a
    // viewer who rewound further back to the target on the next refresh. The
    // threshold is the window instead.
    expect(hls.config.liveMaxLatencyDuration).toBe(600);
  });

  it("uses the average segment length, not EXT-X-TARGETDURATION", () => {
    const { hls } = setup();
    // The fixture's targetduration is 6 while segments average 2 s. Placing the
    // player by EXT-X-TARGETDURATION would ask for 78 s of latency in a 28 s
    // window.
    levelUpdated(hls, {
      live: true,
      totalduration: 28,
      averagetargetduration: 2,
      targetduration: 6,
    });
    expect(hls.config.liveSyncDuration).toBe(26);
  });

  it("sets each value once and leaves HLS.js alone while the window only jitters", () => {
    const { hls } = setup();
    // Real playlists report 28.03, 27.97, 28.05… as segments of unequal
    // length slide through the window. None of that is a change of window.
    for (const totalduration of [28.03, 27.97, 28.05, 28.0]) {
      levelUpdated(hls, {
        live: true,
        totalduration,
        averagetargetduration: 2,
      });
    }
    expect(hls.targetLatencySets).toBe(1);
    expect(hls.config.liveSyncDuration).toBeCloseTo(26.03, 2);
  });

  it("follows a genuine change of window length", () => {
    const { hls } = setup();
    levelUpdated(hls, {
      live: true,
      totalduration: 28,
      averagetargetduration: 2,
    });
    levelUpdated(hls, {
      live: true,
      totalduration: 60,
      averagetargetduration: 2,
    });
    expect(hls.targetLatencySets).toBe(2);
    expect(hls.config.liveSyncDuration).toBe(58);
    expect(hls.config.liveMaxLatencyDuration).toBe(62);
  });

  it("does not touch VOD", () => {
    const { hls } = setup();
    levelUpdated(hls, {
      live: false,
      totalduration: 600,
      averagetargetduration: 2,
    });
    expect(hls.config.liveSyncDuration).toBeUndefined();
    expect(hls.config.liveMaxLatencyDuration).toBeUndefined();
    expect(hls.targetLatencySets).toBe(0);
  });

  it("respects live sync settings the integrator configured", () => {
    const { hls } = setup();
    hls.userConfig.liveSyncDurationCount = 5;
    hls.userConfig.liveMaxLatencyDurationCount = 10;
    levelUpdated(hls, {
      live: true,
      totalduration: 28,
      averagetargetduration: 2,
    });
    expect(hls.config.liveSyncDuration).toBeUndefined();
    expect(hls.config.liveMaxLatencyDuration).toBeUndefined();
    expect(hls.targetLatencySets).toBe(0);
  });

  it("leaves the re-sync threshold alone when the integrator set only the target", () => {
    // HLS.js allows configuring the sync side alone. A threshold derived from
    // our target could sit below theirs — a config HLS.js itself rejects —
    // and would mix count-based settings with a duration-based one.
    const { hls } = setup();
    hls.userConfig.liveSyncDurationCount = 40;
    levelUpdated(hls, {
      live: true,
      totalduration: 300,
      averagetargetduration: 2,
    });
    expect(hls.config.liveMaxLatencyDuration).toBeUndefined();
    expect(hls.targetLatencySets).toBe(0);
  });

  it("holds the forward buffer to the average segment, not EXT-X-TARGETDURATION", () => {
    // 2 s segments under a 6 s target duration, in a window so narrow that
    // the floor of two segments decides: two real segments, not two target
    // durations.
    const { hls } = setup();
    levelUpdated(hls, {
      live: true,
      totalduration: 8,
      averagetargetduration: 2,
      targetduration: 6,
    });
    expect(hls.config.maxBufferLength).toBe(4);
  });

  it("respects a buffer length the integrator configured", () => {
    const { hls } = setup();
    hls.userConfig.maxBufferLength = 60;
    hls.config.maxBufferLength = 60;
    levelUpdated(hls, {
      live: true,
      totalduration: 28,
      averagetargetduration: 2,
    });
    expect(hls.config.maxBufferLength).toBe(60);
  });

  it("respects a buffer length of zero, which is a setting and not an absence", () => {
    const { hls } = setup();
    // Zero leaves HLS.js to size the buffer from `maxBufferSize` alone.
    hls.userConfig.maxBufferLength = 0;
    hls.config.maxBufferLength = 0;
    levelUpdated(hls, {
      live: true,
      totalduration: 28,
      averagetargetduration: 2,
    });
    expect(hls.config.maxBufferLength).toBe(0);
    expect(hls.config.maxMaxBufferLength).toBe(600);
  });
});

describe("HLS.js engine event wiring", () => {
  it("keeps the registry when a media element is attached", () => {
    // HLS.js fetches the playlists as soon as the master is parsed, whether
    // or not an element is attached, and re-attaches one of its own accord:
    // `recoverMediaError()` detaches and attaches to get past a media error.
    // Dropping the registry there leaves a VOD stream, which never fetches
    // its playlists again, loading every fragment over HTTP in silence.
    const { engine, hls } = setup();
    const core = (engine as unknown as { core: { destroy: () => void } }).core;
    const destroy = vi.fn();
    core.destroy = destroy;

    fire(hls, "hlsMediaDetached");
    fire(hls, "hlsMediaAttached");
    expect(destroy).not.toHaveBeenCalled();

    // Loading a source is a new stream, and does let the core go.
    fire(hls, "hlsManifestLoading");
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("survives a playlist that lists no fragments", () => {
    // A level whose media playlist momentarily lists none: reading
    // `fragments[0].type` before the length is checked throws inside an
    // HLS.js event dispatch, which HLS.js reports as an internal-exception
    // ERROR.
    const { hls } = setup();
    expect(hls.handlers.has("hlsLevelUpdated")).toBe(true);
    expect(() =>
      fire(hls, "hlsLevelUpdated", {
        details: { live: false, totalduration: 0, fragments: [] },
      }),
    ).not.toThrow();
  });

  it("listens for the level playlist alone", () => {
    // HLS.js parses an alternate audio track's playlist with
    // `PlaylistLevelType.AUDIO` on every fragment, so an AUDIO_TRACK_LOADED
    // listener could never reach the tuning below its `main` test.
    const { hls } = setup();
    expect(hls.handlers.has("hlsAudioTrackLoaded")).toBe(false);
  });
});

describe("HLS.js construction through the mixin", () => {
  class FakeHlsClass {
    static received: Record<string, unknown> | undefined;
    constructor(config: Record<string, unknown>) {
      FakeHlsClass.received = config;
    }
  }
  const HlsWithP2P = injectMixin(FakeHlsClass);

  it("turns low-latency mode off unless the integrator sets it", () => {
    new HlsWithP2P({});
    expect(FakeHlsClass.received?.lowLatencyMode).toBe(false);
    expect(FakeHlsClass.received?.fLoader).toBeDefined();
    expect(FakeHlsClass.received?.pLoader).toBeDefined();

    new HlsWithP2P({ lowLatencyMode: true } as never);
    expect(FakeHlsClass.received?.lowLatencyMode).toBe(true);
  });
});

describe("HLS.js instance changes", () => {
  it("binds the next instance although letting the previous one go threw", () => {
    // The engine attaches inside HLS.js's construction of the playlist
    // loader. A throw there would abort the new source's manifest request,
    // so the previous instance's teardown failure — an integrator's segment
    // storage — is logged, and the new instance is bound all the same.
    const engine = new HlsJsP2PEngine();
    const first = createFakeHls();
    const second = createFakeHls();
    let current: ReturnType<typeof createFakeHls> = first;
    engine.bindHls(() => current);
    const { pLoader } = engine.getConfigForHlsJs() as {
      pLoader: new (config: HlsConfig) => unknown;
    };
    class FakeLoader {
      stats = {};
      context = {};
      load() {}
      abort() {}
      destroy() {}
    }
    new pLoader({ loader: FakeLoader } as unknown as HlsConfig);
    expect(first.handlers.size).toBeGreaterThan(0);
    const core = (engine as unknown as { core: { segmentStorage?: unknown } })
      .core;
    core.segmentStorage = {
      setSegmentChangeCallback: () => undefined,
      destroy: () => {
        throw new Error("storage teardown failed");
      },
    };

    current = second;
    expect(
      () => new pLoader({ loader: FakeLoader } as unknown as HlsConfig),
    ).not.toThrow();

    expect(second.handlers.size).toBeGreaterThan(0);
    expect(core.segmentStorage).toBeUndefined();
  });
});
