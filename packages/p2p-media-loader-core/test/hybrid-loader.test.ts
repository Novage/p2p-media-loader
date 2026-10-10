import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestsContainer } from "../src/requests/request-container.js";
import type {
  SegmentWithStream,
  StreamDetails,
  StreamWithSegments,
} from "../src/internal-types.js";
import type { CoreEventMap, StreamConfig } from "../src/types.js";
import type { SegmentStorage } from "../src/segment-storage/index.js";

/**
 * The two collaborators that would reach the network are replaced. The P2P
 * loader container is a fake the test controls — which peers exist, which
 * segments they hold — and the HTTP executor only marks the request loading,
 * the way the real one does before its first byte arrives. Everything else —
 * the requests container, the request state machine, the queue, the playback
 * tracker — is the real code.
 */
const fakes = vi.hoisted(() => {
  const state = {
    requests: undefined as unknown as RequestsContainer,
    peerCount: 0,
    loadedBySomeone: new Set<string>(),
    httpStarted: [] as string[],
    httpAborted: [] as string[],
    p2pStarted: [] as string[],
    p2pAborted: [] as string[],
    httpControls: new Map<
      string,
      { addLoadedChunk: (c: Uint8Array) => void; completeOnSuccess: () => void }
    >(),
  };
  class FakeP2PLoader {
    get connectedPeerCount() {
      return state.peerCount;
    }
    get connectedPeerIds() {
      return Array.from({ length: state.peerCount }, (_, i) => `peer-${i}`)[
        Symbol.iterator
      ]();
    }
    isSegmentLoadedBySomeone(segment: SegmentWithStream) {
      return state.loadedBySomeone.has(segment.runtimeId);
    }
    isSegmentLoadingOrLoadedBySomeone(segment: SegmentWithStream) {
      return state.loadedBySomeone.has(segment.runtimeId);
    }
    broadcastAnnouncement() {}
    downloadSegment(segment: SegmentWithStream) {
      state.p2pStarted.push(segment.runtimeId);
      state.requests
        .getOrCreateRequest(segment)
        .start(
          { downloadSource: "p2p", peerId: "peer-0" },
          { onAbort: () => state.p2pAborted.push(segment.runtimeId) },
        );
    }
  }
  const loader = new FakeP2PLoader();
  class FakeP2PLoadersContainer {
    constructor(_stream: unknown, requests: RequestsContainer) {
      state.requests = requests;
    }
    get currentLoader() {
      return loader;
    }
    changeCurrentLoader() {}
    destroy() {}
  }
  class FakeHttpRequestExecutor {
    constructor(
      private readonly request: {
        segment: SegmentWithStream;
        start: (
          data: { downloadSource: "http" },
          controls: { onAbort: () => void },
        ) => unknown;
      },
    ) {}
    execute() {
      const id = this.request.segment.runtimeId;
      state.httpStarted.push(id);
      const controls = this.request.start(
        { downloadSource: "http" },
        { onAbort: () => state.httpAborted.push(id) },
      );
      state.httpControls.set(id, controls as never);
    }
  }
  return { state, FakeP2PLoadersContainer, FakeHttpRequestExecutor };
});

// Counts how many times a pass walks the stream to build a queue: the walk
// starts at the first segment and runs to the one last requested, so on a
// long VOD it is the length of the stream.
const queueGenerations = vi.hoisted(() => ({ count: 0 }));
vi.mock("../src/utils/queue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/utils/queue.js")>();
  return {
    ...actual,
    generateQueue: (...args: Parameters<typeof actual.generateQueue>) => {
      queueGenerations.count++;
      return actual.generateQueue(...args);
    },
  };
});

vi.mock("../src/p2p/loaders-container.js", () => ({
  P2PLoadersContainer: fakes.FakeP2PLoadersContainer,
}));
vi.mock("../src/http-loader.js", () => ({
  HttpRequestExecutor: fakes.FakeHttpRequestExecutor,
}));

import { HybridLoader } from "../src/hybrid-loader.js";
import { Core } from "../src/core.js";
import { BandwidthCalculator } from "../src/bandwidth-calculator.js";
import { EventTarget } from "../src/utils/event-target.js";
import { rankForSegment } from "../src/utils/election.js";
import debug from "debug";
import { diagnostics as compiledLedger } from "../src/diagnostics.js";

// Absent only in a prebuilt bundle; the tests run on the source.
if (!compiledLedger) throw new Error("diagnostics are compiled out");
const ledger = compiledLedger;
// The ledger decides once, at its first record: on, for the whole file.
debug.enable("p2pml:diagnostics");
ledger.snapshot();
debug.disable();
const count = (name: string) => ledger.snapshot()?.counters[name] ?? 0;

const SEGMENT_DURATION = 4;

function createStream(
  segmentCount: number,
  rendition = "720p",
): StreamWithSegments {
  const stream = {
    runtimeId: `https://cdn.example/v/${rendition}/index.m3u8`,
    type: "main",
    properties: { bitrate: 1_000_000 },
    swarmId: "https://cdn.example/v/master.m3u8",
    identityHash: `id-${rendition}`,
    streamSwarmId: `v3-swarm-main-id-${rendition}`,
    infoHash: "hash",
    segments: new Map<string, SegmentWithStream>(),
  } as StreamWithSegments;
  for (let i = 0; i < segmentCount; i++) {
    const runtimeId = `seg-${i}`;
    stream.segments.set(runtimeId, {
      runtimeId,
      externalId: i,
      url: `https://cdn.example/v/720p/${i}.ts`,
      startTime: i * SEGMENT_DURATION,
      endTime: (i + 1) * SEGMENT_DURATION,
      stream,
    });
  }
  return stream;
}

const emptyStorage = {
  hasSegment: () => false,
  getSegmentData: () => Promise.resolve(undefined),
  onSegmentRequested: () => undefined,
  onPlaybackUpdated: () => undefined,
  storeSegment: () => Promise.resolve(),
  getUsage: () => ({ totalCapacity: 100, usedCapacity: 0 }),
} as unknown as SegmentStorage;

/** A storage holding one segment, with whatever bytes the test wants. */
const storageHolding = (segmentId: number, data: ArrayBuffer) =>
  ({
    ...emptyStorage,
    hasSegment: (_swarmId: string, _streamSwarmId: string, id: number) =>
      id === segmentId,
    getSegmentData: () => Promise.resolve(data),
  }) as unknown as SegmentStorage;

/** Lets the queued microtask run processQueue. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
/** The same, under fake timers, where a timeout would never fire. */
const flushMicrotasks = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

function setup(
  configOverrides: Partial<StreamConfig> = {},
  storage: SegmentStorage = emptyStorage,
  streamDetails: StreamDetails = { isLive: false, liveTarget: undefined },
  /** The segment the loader is created for; the first request of it is no seek. */
  anchor = 0,
) {
  const stream = createStream(30);
  const segment = (i: number) => stream.segments.get(`seg-${i}`)!;
  const bandwidth = {
    all: new BandwidthCalculator(),
    http: new BandwidthCalculator(),
  };
  const config: StreamConfig = {
    ...Core.DEFAULT_STREAM_CONFIG,
    simultaneousHttpDownloads: 1,
    simultaneousP2PDownloads: 1,
    // A request is urgent below 3 s of buffer. A test that reports nothing
    // has 0 s, so its requests are urgent; one that reports chooses.
    urgentBufferThreshold: 3,
    httpDownloadTimeWindow: 40,
    p2pDownloadTimeWindow: 60,
    httpDownloadInitialTimeoutMs: 0,
    ...configOverrides,
  };
  const loader = new HybridLoader(
    segment(anchor),
    streamDetails,
    config,
    bandwidth,
    storage,
    {} as never,
    new EventTarget<CoreEventMap>(),
    "me",
  );
  const { state } = fakes;
  const callbacks = { onSuccess: vi.fn(), onError: vi.fn() };
  /** A download the queue started on an earlier pass. */
  const startLoading = (i: number, source: "http" | "p2p") =>
    state.requests
      .getOrCreateRequest(segment(i))
      .start(
        source === "http"
          ? { downloadSource: "http" }
          : { downloadSource: "p2p", peerId: "peer-0" },
        {
          onAbort: () =>
            (source === "http" ? state.httpAborted : state.p2pAborted).push(
              `seg-${i}`,
            ),
        },
      );
  const status = (i: number) => state.requests.get(segment(i))?.status;
  return { loader, segment, callbacks, startLoading, status, state, bandwidth };
}

describe("HybridLoader: making room for an urgent request", () => {
  beforeEach(() => {
    // HybridLoader schedules its prefetch timer on `window`.
    vi.stubGlobal("window", globalThis);
    const { state } = fakes;
    state.peerCount = 0;
    state.loadedBySomeone.clear();
    state.httpStarted.length = 0;
    state.httpAborted.length = 0;
    state.p2pStarted.length = 0;
    state.p2pAborted.length = 0;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stops every other HTTP download, so it has the link to itself", async () => {
    // The owner's prefetch shared the link with the urgent request and made
    // a seek slower than without P2P.
    const prefetchStopped = count("Prefetch:yielded-to-urgent");
    const { loader, segment, callbacks, startLoading, status, state } = setup({
      simultaneousHttpDownloads: 3,
    });
    startLoading(5, "http");
    startLoading(8, "http");

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(state.httpAborted.sort()).toEqual(["seg-5", "seg-8"]);
    expect(status(5)).toBe("aborted");
    expect(status(8)).toBe("aborted");
    expect(state.httpStarted).toEqual(["seg-0"]);
    expect(count("Prefetch:yielded-to-urgent")).toBe(prefetchStopped + 2);
    loader.destroy();
  });

  it("leaves P2P downloads alone", async () => {
    const { loader, segment, callbacks, startLoading, status, state } = setup();
    startLoading(5, "http");
    startLoading(8, "p2p"); // last in the queue, but the wrong kind

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(state.httpAborted).toEqual(["seg-5"]);
    expect(state.p2pAborted).toEqual([]);
    expect(status(8)).toBe("loading");
    expect(state.httpStarted).toEqual(["seg-0"]);
    loader.destroy();
  });

  it("frees a P2P slot the same way when HTTP is not an option", async () => {
    // httpErrorRetries 0: no HTTP attempt is ever allowed, so the urgent
    // request can only go through a peer that has it.
    const { loader, segment, callbacks, startLoading, status, state } = setup({
      httpErrorRetries: 0,
    });
    state.loadedBySomeone.add("seg-0").add("seg-8");
    startLoading(8, "p2p");

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(state.p2pAborted).toEqual(["seg-8"]);
    expect(status(8)).toBe("aborted");
    expect(state.p2pStarted).toEqual(["seg-0"]);
    expect(status(0)).toBe("loading");
    expect(state.httpStarted).toEqual([]);
    loader.destroy();
  });

  it("leaves the download of its own segment alone", async () => {
    // The player seeks to segment 3, which prefetch is already downloading
    // over HTTP in the only slot. Nothing is aborted, and nothing ahead of it
    // is fetched over HTTP: only the player's request is ever urgent.
    const { loader, segment, callbacks, startLoading, status, state } = setup();
    startLoading(3, "http");

    await loader.loadSegment(segment(3), callbacks);
    await flush();

    expect(state.httpAborted).toEqual([]);
    expect(status(3)).toBe("loading");
    expect(state.httpStarted).toEqual([]);
    expect(status(4)).toBeUndefined();
    loader.destroy();
  });

  it("stops nothing for a request that is not urgent", async () => {
    // No peer is connected, so the request starts at once all the same; with
    // a full buffer it is not urgent, and the free slot is enough.
    const { loader, segment, callbacks, startLoading, status, state } = setup({
      simultaneousHttpDownloads: 2,
    });
    loader.updatePlayback({ bufferAhead: 10, rate: 1 });
    startLoading(8, "http");

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(state.httpAborted).toEqual([]);
    expect(status(8)).toBe("loading");
    expect(state.httpStarted).toEqual(["seg-0"]);
    loader.destroy();
  });

  it("starts no HTTP prefetch while the urgent request downloads, and resumes after", async () => {
    // A peer is connected, so the pass ends with the owner's prefetch.
    fakes.state.peerCount = 1;
    const { loader, segment, callbacks, state } = setup({
      simultaneousHttpDownloads: 3,
    });

    await loader.loadSegment(segment(0), callbacks);
    await flush();
    loader.updateStream(segment(0).stream);
    await flush();
    expect(state.httpStarted).toEqual(["seg-0"]);

    const controls = state.httpControls.get("seg-0")!;
    controls.addLoadedChunk(new Uint8Array(16));
    controls.completeOnSuccess();
    await flush();
    expect(state.httpStarted.length).toBeGreaterThan(1);
    loader.destroy();
  });
});

describe("HybridLoader: urgency", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
    const { state } = fakes;
    state.peerCount = 0;
    state.loadedBySomeone.clear();
    state.httpStarted.length = 0;
    state.httpAborted.length = 0;
    state.p2pStarted.length = 0;
    state.p2pAborted.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Three HTTP slots, and no threshold configured: what the loader derives decides. */
  const derived = {
    simultaneousHttpDownloads: 3,
    urgentBufferThreshold: undefined,
  };
  /** A four-segment window of five second segments: the delay is 15 s. */
  const liveTarget = { delay: 15, segment: 5 };

  /** Whether a request made with `bufferAhead` of buffer is urgent. */
  async function judged(
    bufferAhead: number,
    config: Partial<StreamConfig>,
    streamDetails: StreamDetails = { isLive: false, liveTarget: undefined },
  ) {
    const urgent = count("SegmentRequest:urgent");
    const notUrgent = count("SegmentRequest:not-urgent");
    const { loader, segment, callbacks } = setup(
      config,
      emptyStorage,
      streamDetails,
    );
    loader.updatePlayback({ bufferAhead, rate: 1 });
    await loader.loadSegment(segment(0), callbacks);
    await flush();
    loader.destroy();
    const wasUrgent = count("SegmentRequest:urgent") === urgent + 1;
    const wasNot = count("SegmentRequest:not-urgent") === notUrgent + 1;
    expect(wasUrgent).not.toBe(wasNot);
    return wasUrgent;
  }

  it("takes a player that has not reported as one with nothing buffered", async () => {
    // With a peer connected, a request that is not urgent would wait for it.
    fakes.state.peerCount = 1;
    const urgent = count("SegmentRequest:urgent");
    const { loader, segment, callbacks, state } = setup();

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(count("SegmentRequest:urgent")).toBe(urgent + 1);
    expect(state.httpStarted).toContain("seg-0");
    loader.destroy();
  });

  it("fetches over HTTP only the player's request, nothing ahead of it", async () => {
    // Three free slots, and segments 1 and 2 close behind the request. The
    // player asks for them when it wants them; fetching them first would be
    // faster than the player alone, at the cost of the HTTP bytes P2P saves.
    const { loader, segment, callbacks, state } = setup(derived);

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(state.httpStarted).toEqual(["seg-0"]);
    loader.destroy();
  });

  it("is 15 s of buffer off live by default", async () => {
    expect(await judged(14, derived)).toBe(true);
    expect(await judged(16, derived)).toBe(false);
  });

  it("is half the player's buffer on live, derived from the live window", async () => {
    // Delay 15 less a segment is a 10 s buffer; half of it is 5 s.
    const live = { isLive: true, liveTarget };
    expect(await judged(4, derived, live)).toBe(true);
    expect(await judged(6, derived, live)).toBe(false);
  });

  it("is lowered by a configured number on live, and never raised by one", async () => {
    // 30 s over a player that buffers 10 s would make every request urgent,
    // leaving the election nothing: the geometry wins, at the same 5 s.
    const live = { isLive: true, liveTarget };
    expect(
      await judged(6, { ...derived, urgentBufferThreshold: 30 }, live),
    ).toBe(false);
    // Lower than the derived threshold is the integrator's to ask for: it
    // leaves peers more room, not less.
    expect(
      await judged(4, { ...derived, urgentBufferThreshold: 3 }, live),
    ).toBe(false);
  });

  it("scales with the playback rate", async () => {
    // At 2x, 10 s of buffer lasts 5 s: under a 3 s threshold it is 6 s.
    const { loader, segment, callbacks, state } = setup();
    fakes.state.peerCount = 1;
    loader.updatePlayback({ bufferAhead: 5, rate: 2 });
    await loader.loadSegment(segment(0), callbacks);
    await flush();
    expect(state.httpStarted).toContain("seg-0");
    loader.destroy();
  });

  it("fetches a request that is not urgent at once when no peer is connected", async () => {
    // Nobody to take it from, nobody to elect: it goes over HTTP now.
    const { loader, segment, callbacks, state } = setup(derived, emptyStorage, {
      isLive: true,
      liveTarget,
    });
    loader.updatePlayback({ bufferAhead: 10, rate: 1 });

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(state.httpStarted).toEqual(["seg-0"]);
    loader.destroy();
  });

  it("takes a request that is not urgent from a peer that has it", async () => {
    fakes.state.peerCount = 1;
    fakes.state.loadedBySomeone.add("seg-0");
    const { loader, segment, callbacks, state } = setup();
    loader.updatePlayback({ bufferAhead: 10, rate: 1 });

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(state.p2pStarted).toEqual(["seg-0"]);
    expect(state.httpStarted).not.toContain("seg-0");
    loader.destroy();
  });

  it("moves a request coming over P2P to HTTP when its buffer drains", async () => {
    fakes.state.peerCount = 1;
    fakes.state.loadedBySomeone.add("seg-0");
    const became = count("SegmentRequest:became-urgent");
    const { loader, segment, callbacks, state } = setup();
    loader.updatePlayback({ bufferAhead: 10, rate: 1 });
    await loader.loadSegment(segment(0), callbacks);
    await flush();
    expect(state.p2pStarted).toEqual(["seg-0"]);

    loader.updatePlayback({ bufferAhead: 2, rate: 1 });
    await flush();

    expect(state.p2pAborted).toEqual(["seg-0"]);
    expect(state.httpStarted).toContain("seg-0");
    expect(count("SegmentRequest:became-urgent")).toBe(became + 1);
    loader.destroy();
  });

  it("judges a waiting request again as the buffer drains, with no new report", async () => {
    // The player stopped reporting with 10 s buffered. The report ages at
    // the rate it gave, and the timer judges the request again: it becomes
    // urgent before the buffer runs out, rather than waiting for ever.
    // Segment 2 ranks this peer as the backup of `peer-0`, and a fast link
    // keeps the backup's turn until just before the request is urgent.
    vi.useFakeTimers();
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    fakes.state.peerCount = 1;
    const { loader, segment, callbacks, state, bandwidth } = setup(
      {},
      emptyStorage,
      undefined,
      2,
    );
    const download = bandwidth.http.startLoading(clock - 1000);
    bandwidth.http.addBytes(download, 20_000_000);
    bandwidth.http.stopLoading(download, clock);
    loader.updatePlayback({ bufferAhead: 10, rate: 1 });
    await loader.loadSegment(segment(2), callbacks);
    await flushMicrotasks();
    expect(state.httpStarted).not.toContain("seg-2");

    clock += 6_000;
    vi.advanceTimersByTime(2000);
    await flushMicrotasks();
    expect(state.httpStarted).not.toContain("seg-2");

    clock += 2_000;
    vi.advanceTimersByTime(2000);
    await flushMicrotasks();
    expect(state.httpStarted).toContain("seg-2");
    loader.destroy();
  });

  it("leaves a request that is not urgent to the election while a peer is connected", async () => {
    // Segment 2 ranks this peer as the backup of `peer-0`, and a fast link
    // puts its deadline well after the 5 s the request has before it is
    // urgent: the owner's turn first.
    // Slots enough for what this peer owns ahead as well: a backup takes
    // none from prefetch, only an urgent request does.
    const { loader, segment, callbacks, state, bandwidth } = setup(
      { ...derived, simultaneousHttpDownloads: 10 },
      emptyStorage,
      { isLive: true, liveTarget },
      2,
    );
    fakes.state.peerCount = 1;
    const now = performance.now();
    const download = bandwidth.http.startLoading(now - 1000);
    bandwidth.http.addBytes(download, 20_000_000);
    bandwidth.http.stopLoading(download, now);
    loader.updatePlayback({ bufferAhead: 10, rate: 1 });

    await loader.loadSegment(segment(2), callbacks);
    await flush();

    expect(state.httpStarted).not.toContain("seg-2");
    expect(state.p2pStarted).toEqual([]);

    // Half a second before it would be urgent, the backup steps in.
    loader.updatePlayback({ bufferAhead: 5.4, rate: 1 });
    loader.updateStream(segment(2).stream);
    await flush();
    expect(state.httpStarted).toContain("seg-2");
    loader.destroy();
  });

  it("never steps in as a backup for a segment its player has not asked for", async () => {
    // The request comes from a peer, and the prefetch runs on the segments
    // ahead of it. Before the player asks there is no deadline to judge, so
    // only this peer's own segments are fetched over HTTP, whatever time is
    // left — a backup's turn comes with its player's request.
    fakes.state.peerCount = 1;
    fakes.state.loadedBySomeone.add("seg-0");
    const { loader, segment, callbacks, state } = setup(derived);
    loader.updatePlayback({ bufferAhead: 10, rate: 1 });

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(state.httpStarted.length).toBeGreaterThan(0);
    for (const id of state.httpStarted) {
      expect(rankForSegment("me", ["peer-0"], Number(id.slice(4)))).toBe(0);
    }
    loader.destroy();
  });
});

describe("HybridLoader: a stored segment that reads back empty", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
    const { state } = fakes;
    state.peerCount = 0;
    state.loadedBySomeone.clear();
    state.httpStarted.length = 0;
  });
  afterEach(() => {
    // A test that timed out under fake timers never reaches its own cleanup.
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("is not delivered to the player, and the segment is loaded again", async () => {
    // A storage implementation that let its buffer be detached: it still
    // reports the segment, and hands back nothing.
    const { loader, segment, callbacks, state } = setup(
      {},
      storageHolding(0, new ArrayBuffer(0)),
    );

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(callbacks.onSuccess).not.toHaveBeenCalled();
    expect(state.httpStarted).toEqual(["seg-0"]);
    loader.destroy();
  });

  it("fails the request when the storage throws as it starts", async () => {
    // A custom storage is the integrator's code. Whatever it throws, the
    // request settles: a caller left waiting on it would wait for ever.
    const broken = {
      ...emptyStorage,
      onSegmentRequested: () => {
        throw new Error("storage is broken");
      },
    } as unknown as SegmentStorage;
    const { loader, segment, callbacks } = setup({}, broken);

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    expect(callbacks.onSuccess).not.toHaveBeenCalled();
    loader.destroy();
  });

  it("builds one queue per pass, and prefetches from it", async () => {
    const { loader, segment, callbacks, state } = setup({
      httpDownloadInitialTimeoutMs: 0,
    });
    // A peer is connected, so the pass ends by prefetching what this peer owns.
    state.peerCount = 3;
    queueGenerations.count = 0;

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(queueGenerations.count).toBe(1);
    expect(state.httpStarted.length).toBeGreaterThan(0);
    loader.destroy();
  });

  it("does not fetch over HTTP what the same pass just asked a peer for", async () => {
    // The queue the pass hands to the prefetch carries statuses from the
    // moment it was built, and the pass starts downloads after that. What
    // moves is whether a segment is being loaded by someone; what covers it
    // is that the prefetch reads the request state live, not from the queue.
    const { loader, segment, callbacks, state } = setup({
      httpDownloadInitialTimeoutMs: 0,
      simultaneousP2PDownloads: 3,
    });
    state.peerCount = 3;
    // Peers have the segments just ahead of the playhead.
    for (let i = 1; i <= 3; i++) state.loadedBySomeone.add(`seg-${i}`);

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    const both = state.p2pStarted.filter((id) =>
      state.httpStarted.includes(id),
    );
    expect(state.p2pStarted.length).toBeGreaterThan(0);
    expect(both).toEqual([]);
    loader.destroy();
  });

  it("stores a settled request under its own stream, not the one last requested", async () => {
    // The player switched rendition while a request of the previous one was
    // in flight. Filed under the new rendition's identity, its bytes would be
    // served to the player, and to peers, as the new rendition's segment.
    const storeSegment = vi.fn(() => Promise.resolve());
    // A second slot, and a full buffer: the new rendition's request is not
    // urgent, so it leaves the download in flight alone.
    const { loader, segment, callbacks, state } = setup(
      { simultaneousHttpDownloads: 2 },
      { ...emptyStorage, storeSegment } as unknown as SegmentStorage,
    );
    loader.updatePlayback({ bufferAhead: 10, rate: 1 });
    const previous = segment(0).stream;
    const controls = state.requests
      .getOrCreateRequest(segment(1))
      .start({ downloadSource: "http" }, { onAbort: () => undefined });

    const next = createStream(30, "1080p");
    await loader.loadSegment(next.segments.get("seg-0")!, callbacks);
    controls.addLoadedChunk(new Uint8Array(16));
    controls.completeOnSuccess();
    await flush();

    expect(storeSegment).toHaveBeenCalledTimes(1);
    const [swarmId, streamSwarmId, externalId] = storeSegment.mock
      .calls[0] as unknown as [string, string, number];
    expect([swarmId, streamSwarmId, externalId]).toEqual([
      previous.swarmId,
      previous.streamSwarmId,
      1,
    ]);
    loader.destroy();
  });

  it("measures storage capacity once per pass", async () => {
    // Measuring walks the whole segment cache; a pass generates one queue
    // and prefetches from it, and measures once for both.
    const getUsage = vi.fn(() => ({ totalCapacity: 100, usedCapacity: 0 }));
    const { loader, segment, callbacks, state } = setup({}, {
      ...emptyStorage,
      getUsage,
    } as unknown as SegmentStorage);
    state.peerCount = 3;

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(queueGenerations.count).toBeGreaterThan(0);
    expect(getUsage).toHaveBeenCalledTimes(1);
    loader.destroy();
  });

  it("does not run a pass queued before it was destroyed", async () => {
    // A request settling schedules a pass; the adapter tears the core down
    // in the same task. The pass would reach a storage already destroyed.
    const getUsage = vi.fn(() => ({ totalCapacity: 100, usedCapacity: 0 }));
    const { loader, segment, callbacks } = setup({}, {
      ...emptyStorage,
      getUsage,
    } as unknown as SegmentStorage);

    // No await in between: the pass is queued, the loader is gone.
    void loader.loadSegment(segment(0), callbacks);
    loader.destroy();
    await flush();

    expect(getUsage).not.toHaveBeenCalled();
  });

  it("re-checks backup deadlines within two seconds whatever the swarm size", async () => {
    // A paused player reports nothing, and a report ages with the clock, so
    // the timer is what drives the election between reports. The deadlines
    // are sub-second; a period that grew with the peer count would leave a
    // request to become urgent unfetched.
    vi.useFakeTimers();
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    try {
      const { state } = fakes;
      state.peerCount = 50;
      const { loader, segment, callbacks } = setup();
      await loader.loadSegment(segment(0), callbacks);
      loader.updatePlayback({ bufferAhead: 10, rate: 1 });
      await flushMicrotasks();
      queueGenerations.count = 0;

      // Time passes; the report ages with the clock, and the election last
      // judged from a buffer that has since drained.
      clock += 5_000;
      vi.advanceTimersByTime(2000);

      expect(queueGenerations.count).toBeGreaterThan(0);
      loader.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps ticking after a tick threw", async () => {
    // A custom storage that fails once from the timer's election. The timer
    // is all that elects for a paused player; a chain ended by one throw
    // would end for the session.
    let failNext = false;
    const getUsage = vi.fn(() => {
      if (failNext) {
        failNext = false;
        throw new Error("storage hiccup");
      }
      return { totalCapacity: 100, usedCapacity: 0 };
    });
    vi.useFakeTimers();
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    try {
      const { state } = fakes;
      state.peerCount = 3;
      const { loader, segment, callbacks } = setup({}, {
        ...emptyStorage,
        getUsage,
      } as unknown as SegmentStorage);
      await loader.loadSegment(segment(0), callbacks);
      loader.updatePlayback({ bufferAhead: 10, rate: 1 });
      await flushMicrotasks();

      // The report has aged; this tick elects, and its measurement throws.
      clock += 5_000;
      failNext = true;
      vi.advanceTimersByTime(2000);
      expect(failNext).toBe(false);
      queueGenerations.count = 0;

      clock += 5_000;
      vi.advanceTimersByTime(2000);
      expect(queueGenerations.count).toBeGreaterThan(0);
      loader.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("measures the capacity again for the brake when the pass stored a segment", async () => {
    // The measure taken to build the queue predates the stores the pass
    // makes; the brake on prefetching must not read a value from before them.
    const getUsage = vi.fn(() => ({ totalCapacity: 100, usedCapacity: 0 }));
    const { loader, segment, callbacks, state } = setup({}, {
      ...emptyStorage,
      getUsage,
    } as unknown as SegmentStorage);
    state.peerCount = 3;
    await loader.loadSegment(segment(0), callbacks);
    await flush();
    const controls = state.httpControls.get("seg-0")!;
    getUsage.mockClear();

    controls.addLoadedChunk(new Uint8Array(16));
    controls.completeOnSuccess();
    await flush();

    expect(getUsage).toHaveBeenCalledTimes(2);
    loader.destroy();
  });

  it("tells the storage the position from the start and on every request", async () => {
    // The position is the start of the segment requested last, on the
    // manifest timeline: told at once, so the storage can judge retention
    // whether or not the player ever reports.
    const onPlaybackUpdated = vi.fn();
    const { loader, segment, callbacks } = setup({}, {
      ...emptyStorage,
      onPlaybackUpdated,
    } as unknown as SegmentStorage);
    expect(onPlaybackUpdated.mock.calls).toEqual([[0, 1, "main"]]);

    await loader.loadSegment(segment(3), callbacks);
    await flush();
    expect(onPlaybackUpdated.mock.calls.at(-1)).toEqual([12, 1, "main"]);

    // A change of the rate to size by is told too; a pause is not one.
    loader.updatePlayback({ bufferAhead: 5, rate: 2 });
    expect(onPlaybackUpdated.mock.calls.at(-1)).toEqual([12, 2, "main"]);
    const told = onPlaybackUpdated.mock.calls.length;
    loader.updatePlayback({ bufferAhead: 5, rate: 0 });
    expect(onPlaybackUpdated.mock.calls.length).toBe(told);
    loader.destroy();
  });

  it("starts no download for a segment the storage is answering", async () => {
    // A seek to a segment the storage holds: the request is this loader's
    // from before the read, so an abort meanwhile finds it — and a pass
    // meanwhile must not start the download an urgent request calls for.
    let release!: (data: ArrayBuffer) => void;
    const storage = {
      ...emptyStorage,
      hasSegment: (_swarmId: string, _streamSwarmId: string, id: number) =>
        id === 5,
      getSegmentData: () =>
        new Promise<ArrayBuffer>((resolve) => (release = resolve)),
    } as unknown as SegmentStorage;
    const { loader, segment, callbacks, state } = setup({}, storage);

    const loading = loader.loadSegment(segment(5), callbacks);
    // A report lands while the storage answers, and runs a pass.
    loader.updatePlayback({ bufferAhead: 1, rate: 1 });
    await flush();
    expect(state.httpStarted).not.toContain("seg-5");
    expect(state.p2pStarted).not.toContain("seg-5");

    release(new Uint8Array([1, 2, 3]).buffer);
    await loading;
    expect(callbacks.onSuccess).toHaveBeenCalledTimes(1);
    loader.destroy();
  });

  it("survives a storage that refuses the position at construction", async () => {
    const storage = {
      ...emptyStorage,
      onPlaybackUpdated: () => {
        throw new Error("no segment requested yet");
      },
    } as unknown as SegmentStorage;
    const { loader, segment, callbacks, state } = setup({}, storage);

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(state.httpStarted).toContain("seg-0");
    loader.destroy();
  });

  it("aborts a request the storage was still answering", async () => {
    // A custom storage answers asynchronously; the player moves on while it
    // does. The bytes must not be delivered to a request the player aborted,
    // nor counted as buffered.
    let release!: (data: ArrayBuffer) => void;
    const storage = {
      ...emptyStorage,
      hasSegment: (_swarmId: string, _streamSwarmId: string, id: number) =>
        id === 0,
      getSegmentData: () =>
        new Promise<ArrayBuffer>((resolve) => (release = resolve)),
    } as unknown as SegmentStorage;
    const { loader, segment, callbacks } = setup({}, storage);

    const loading = loader.loadSegment(segment(0), callbacks);
    loader.abortSegmentRequest("seg-0");
    release(new Uint8Array([1, 2, 3]).buffer);
    await loading;
    await flush();

    expect(callbacks.onSuccess).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    expect(callbacks.onError.mock.calls[0][0]).toMatchObject({
      type: "aborted",
    });
    loader.destroy();
  });

  it("is delivered when the bytes are there", async () => {
    const { loader, segment, callbacks, state } = setup(
      {},
      storageHolding(0, new Uint8Array([1, 2, 3]).buffer),
    );

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(callbacks.onSuccess).toHaveBeenCalledTimes(1);
    // The queue moves on to the next segment; this one is not fetched again.
    expect(state.httpStarted).not.toContain("seg-0");
    loader.destroy();
  });
});

describe("HybridLoader: seeks and re-requests", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
    fakes.state.peerCount = 0;
    fakes.state.loadedBySomeone.clear();
    fakes.state.httpStarted.length = 0;
    fakes.state.httpAborted.length = 0;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the first request after a seek into unbuffered media at once", async () => {
    // A peer is connected, so nothing but urgency fetches it at once: the
    // player reports an empty buffer at the new place.
    fakes.state.peerCount = 1;
    const { loader, segment, callbacks, state } = setup();
    loader.updatePlayback({ bufferAhead: 20, rate: 1 });
    state.loadedBySomeone.add("seg-0");
    await loader.loadSegment(segment(0), callbacks);
    await flush();

    loader.updatePlayback({ bufferAhead: 0, rate: 1 });
    await loader.loadSegment(segment(20), callbacks);
    await flush();
    expect(state.httpStarted).toContain("seg-20");
    loader.destroy();
  });

  it("starts nothing urgent at the position the player left", async () => {
    // Between the seek and the first request at the new place, the position
    // is the old one; the report says the buffer is empty. A request is the
    // only thing that is ever urgent, so nothing goes over HTTP for the
    // segments after the old position.
    const { loader, segment, callbacks, state } = setup();
    await loader.loadSegment(segment(0), callbacks);
    await flush();
    state.httpStarted.length = 0;

    loader.updatePlayback({ bufferAhead: 0, rate: 1 });
    loader.updateStream(segment(0).stream);
    await flush();
    expect(state.httpStarted).toEqual([]);
    loader.destroy();
  });

  it("moves the position with every request, back as well as forward", async () => {
    // dash.js replaces a buffered segment at a higher quality: a request
    // behind the last one. The position, and the queue, move back to it.
    const onPlaybackUpdated = vi.fn();
    const { loader, segment, callbacks, state } = setup({}, {
      ...emptyStorage,
      onPlaybackUpdated,
    } as unknown as SegmentStorage);
    await loader.loadSegment(segment(10), callbacks);
    await flush();
    state.httpControls.get("seg-10")!.addLoadedChunk(new Uint8Array(16));
    state.httpControls.get("seg-10")!.completeOnSuccess();
    await flush();

    state.httpStarted.length = 0;
    await loader.loadSegment(segment(2), callbacks);
    await flush();
    expect(onPlaybackUpdated.mock.calls.at(-1)).toEqual([8, 1, "main"]);
    expect(state.httpStarted).toContain("seg-2");
    loader.destroy();
  });

  it("serves a request behind the one the player abandoned", async () => {
    // HLS.js on a live stream asked for one segment, aborted it, and asked
    // for an earlier one. The request is the position; nothing makes it wait.
    fakes.state.peerCount = 1;
    const { loader, segment, callbacks, state } = setup();
    await loader.loadSegment(segment(10), callbacks);
    await flush();
    loader.abortSegmentRequest("seg-10");

    state.httpStarted.length = 0;
    await loader.loadSegment(segment(6), callbacks);
    await flush();
    expect(state.httpStarted).toContain("seg-6");
    loader.destroy();
  });
});
