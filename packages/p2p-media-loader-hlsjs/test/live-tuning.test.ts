import { describe, expect, it, vi } from "vitest";
import type { HlsConfig } from "hls.js";
import { HlsJsP2PEngine } from "../src/engine.js";
import { injectMixin } from "../src/engine-static.js";

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

function levelUpdated(
  hls: ReturnType<typeof createFakeHls>,
  details: {
    live: boolean;
    totalduration: number;
    averagetargetduration?: number;
    targetduration?: number;
  },
) {
  const segment = details.averagetargetduration ?? 2;
  hls.handlers.get("hlsLevelUpdated")?.("hlsLevelUpdated", {
    details: {
      live: details.live,
      totalduration: details.totalduration,
      targetduration: details.targetduration ?? 6,
      averagetargetduration: details.averagetargetduration,
      fragments: Array.from(
        { length: Math.max(5, Math.round(details.totalduration / segment)) },
        () => ({ type: "main" }),
      ),
    },
  });
}

function setup() {
  const engine = new HlsJsP2PEngine();
  const hls = createFakeHls();
  engine.bindHls(hls);
  // The playlist loader's construction is where the engine attaches to HLS.js.
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
  return { engine, hls };
}

describe("HLS.js live window placement", () => {
  it("places the player one segment inside the tail, re-syncing two segments beyond", () => {
    const { hls } = setup();
    // A 28 s window of 2 s segments: target 26, re-sync past 30.
    levelUpdated(hls, {
      live: true,
      totalduration: 28,
      averagetargetduration: 2,
    });
    expect(hls.config.liveSyncDuration).toBe(26);
    expect(hls.config.liveMaxLatencyDuration).toBe(30);
    expect(hls.config.maxBufferLength).toBe(15);
  });

  it("never asks for more than a minute of latency", () => {
    const { hls } = setup();
    levelUpdated(hls, {
      live: true,
      totalduration: 600,
      averagetargetduration: 6,
    });
    expect(hls.config.liveSyncDuration).toBe(60);
    expect(hls.config.liveMaxLatencyDuration).toBe(72);
  });

  it("uses the average segment length, not EXT-X-TARGETDURATION", () => {
    const { hls } = setup();
    // The fixture's targetduration is 6 while segments average 2 s. With the
    // count-based tuning this stream asked for 78 s of latency in a 28 s window.
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

    hls.handlers.get("hlsMediaAttaching")?.("hlsMediaAttaching", {});
    expect(destroy).not.toHaveBeenCalled();

    // Loading a source is a new stream, and does let the core go.
    hls.handlers.get("hlsManifestLoading")?.("hlsManifestLoading", {});
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
      hls.handlers.get("hlsLevelUpdated")?.("hlsLevelUpdated", {
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
