import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestsContainer } from "../src/requests/request-container.js";
import type {
  SegmentWithStream,
  StreamDetails,
  StreamWithSegments,
} from "../src/internal-types.js";
import type { CoreEventMap, StreamConfig } from "../src/types.js";
import type { AttemptTag } from "../src/requests/request.js";
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
  type Controls = {
    addLoadedChunk: (c: Uint8Array) => void;
    completeOnSuccess: () => void;
    failWithError: (error: Error) => void;
  };
  const state = {
    requests: undefined as unknown as RequestsContainer,
    peerCount: 0,
    loadedBySomeone: new Set<string>(),
    httpStarted: [] as string[],
    /** The fetch priority each HTTP download was started with. */
    httpPriority: new Map<string, string>(),
    httpAborted: [] as string[],
    p2pStarted: [] as string[],
    p2pAborted: [] as string[],
    /** Delivered bytes as counted for the trackers: [stream key, bytes]. */
    downloaded: [] as [string, number][],
    httpControls: new Map<string, Controls>(),
    p2pControls: new Map<string, Controls>(),
    /** Segments a peer was made free for. */
    peerFreedFor: [] as string[],
    /** Whether the fake `freePeerFor` reports that it stopped a download. */
    freePeerStops: false,
    /** Whether the fake `downloadSegment` finds no peer free to send. */
    p2pRefuses: false,
    /** Whether the peer's channel is closing: its attempt fails at once. */
    p2pFailsAtOnce: false,
    /** Whether the request holds all bytes: its attempt succeeds at once. */
    p2pCompletesAtOnce: false,
    /** Segments whose P2P attempt settles at once, and how. */
    p2pAtOnce: new Map<string, "fail" | "succeed">(),
    /** Called as each P2P attempt starts, before it can settle. */
    onP2PStart: undefined as ((id: string) => void) | undefined,
    /** How many times the loader asked to announce its segments. */
    broadcasts: 0,
    /** Each HTTP download's way to report a peer's data as wrong. */
    httpRejectPeer: new Map<
      string,
      (
        peerId: string,
        cause: "validation-failed" | "bytes-length-mismatch",
      ) => void
    >(),
    /** Peers the loader asked to close: [stream, peer id, cause]. */
    closedPeers: [] as [string, string, string][],
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
    broadcastAnnouncement() {
      state.broadcasts++;
    }
    downloadSegment(segment: SegmentWithStream, tag?: AttemptTag) {
      if (state.p2pRefuses) return false;
      state.p2pStarted.push(segment.runtimeId);
      const controls = state.requests
        .getOrCreateRequest(segment)
        .start(
          { downloadSource: "p2p", peerId: "peer-0", tag },
          { onAbort: () => state.p2pAborted.push(segment.runtimeId) },
        );
      state.p2pControls.set(segment.runtimeId, controls as never);
      state.onP2PStart?.(segment.runtimeId);
      const atOnce = state.p2pAtOnce.get(segment.runtimeId);
      if (atOnce === "fail" || (!atOnce && state.p2pFailsAtOnce)) {
        controls.failWithError(new RequestError("peer-closed"));
      } else if (atOnce === "succeed" || state.p2pCompletesAtOnce) {
        controls.addLoadedChunk(new Uint8Array(16));
        controls.completeOnSuccess();
      }
      return true;
    }
    freePeerFor(segment: SegmentWithStream) {
      state.peerFreedFor.push(segment.runtimeId);
      return state.freePeerStops;
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
    noteDownloadedBytes(stream: { runtimeId: string }, bytes: number) {
      state.downloaded.push([stream.runtimeId, bytes]);
    }
    closePeer(stream: { runtimeId: string }, peerId: string, cause: string) {
      state.closedPeers.push([stream.runtimeId, peerId, cause]);
    }
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
      _config: unknown,
      _eventTarget: unknown,
      private readonly priority: string,
      private readonly onPeerBytesRejected: (
        peerId: string,
        cause: "validation-failed" | "bytes-length-mismatch",
      ) => void,
    ) {}
    execute() {
      const id = this.request.segment.runtimeId;
      state.httpStarted.push(id);
      state.httpPriority.set(id, this.priority);
      state.httpRejectPeer.set(id, this.onPeerBytesRejected);
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
import { RequestError } from "../src/types.js";

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

/** The first segment after segment 0 that this peer ranks `rank` for, against `peer-0`. */
const segmentRanked = (rank: number) =>
  Array.from({ length: 20 }, (_, i) => i + 1).find(
    (i) => rankForSegment("me", ["peer-0"], i) === rank,
  )!;

/**
 * The loaders `setup` made and no test has destroyed yet. A test that fails
 * before its own `destroy()` would leave its loader's prefetch timer running
 * into later tests; an `afterEach` destroys what is left here.
 */
const liveLoaders = new Set<HybridLoader>();
const destroyLiveLoaders = () => {
  for (const loader of liveLoaders) loader.destroy();
};
// Every block: a loader a failed test leaves alive must not run into the
// next test.
afterEach(destroyLiveLoaders);

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
  // Once only: a second destroy() would close the loader's record again.
  const destroy = loader.destroy.bind(loader);
  liveLoaders.add(loader);
  loader.destroy = () => {
    if (liveLoaders.delete(loader)) destroy();
  };
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

    // A later pass — forced here by a rate change — counts it no more.
    loader.updatePlayback({ bufferAhead: 1, rate: 2 });
    await flush();
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
    state.downloaded.length = 0;
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

  it("counts a delivered segment for the trackers of its own stream's swarm", async () => {
    // As above: a request of the previous rendition settles after a switch.
    // Its bytes are that swarm's, whatever the current loader is.
    const { loader, segment, callbacks, state } = setup({
      simultaneousHttpDownloads: 2,
    });
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

    expect(state.downloaded).toEqual([[previous.runtimeId, 16]]);
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

describe("HybridLoader: a peer after a failed HTTP attempt", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
    const { state } = fakes;
    state.peerCount = 1;
    state.loadedBySomeone.clear();
    state.httpStarted.length = 0;
    state.httpAborted.length = 0;
    state.p2pStarted.length = 0;
    state.p2pAborted.length = 0;
    state.peerFreedFor.length = 0;
    state.p2pFailsAtOnce = false;
    state.closedPeers.length = 0;
    state.httpControls.clear();
    state.p2pControls.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The election's HTTP prefetch of later segments goes on while the
  // urgent request is not on HTTP; only the player's segment counts here.
  const httpOf = (id: string) =>
    fakes.state.httpStarted.filter((started) => started === id);
  const p2pOf = (id: string) =>
    fakes.state.p2pStarted.filter((started) => started === id);
  const httpError = () => new RequestError("http-error", "503");
  const peerError = () => new RequestError("peer-closed");

  it("tries a peer that has the segment once, between two HTTP attempts", async () => {
    fakes.state.loadedBySomeone.add("seg-0");
    const tried = count("SegmentRequest:peer-after-http-failure");
    const { loader, segment, callbacks, startLoading, status, state } = setup({
      httpErrorRetries: 3,
    });
    // The one P2P slot is busy with prefetch: the urgent request takes it.
    state.loadedBySomeone.add("seg-8");
    startLoading(8, "p2p");

    await loader.loadSegment(segment(0), callbacks);
    await flush();
    expect(httpOf("seg-0")).toEqual(["seg-0"]);

    state.httpControls.get("seg-0")!.failWithError(httpError());
    await flush();
    expect(state.p2pStarted).toEqual(["seg-0"]);
    expect(state.peerFreedFor).toEqual(["seg-0"]);
    expect(state.p2pAborted).toEqual(["seg-8"]);
    expect(status(8)).toBe("aborted");
    expect(httpOf("seg-0")).toEqual(["seg-0"]);
    expect(count("SegmentRequest:peer-after-http-failure")).toBe(tried + 1);

    // A pass while the peer sends it leaves the P2P attempt alone.
    loader.updatePlayback({ bufferAhead: 0, rate: 2 });
    await flush();
    expect(status(0)).toBe("loading");
    expect(state.p2pAborted).toEqual(["seg-8"]);
    expect(httpOf("seg-0")).toEqual(["seg-0"]);

    // The peer fails too: HTTP again at once, and no second P2P attempt.
    state.p2pControls.get("seg-0")!.failWithError(peerError());
    await flush();
    expect(httpOf("seg-0")).toEqual(["seg-0", "seg-0"]);
    state.httpControls.get("seg-0")!.failWithError(httpError());
    await flush();
    expect(httpOf("seg-0")).toEqual(["seg-0", "seg-0", "seg-0"]);
    expect(callbacks.onError).not.toHaveBeenCalled();
    state.httpControls.get("seg-0")!.failWithError(httpError());
    await flush();

    expect(p2pOf("seg-0")).toEqual(["seg-0"]);
    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    expect(callbacks.onError.mock.calls[0][0]).toMatchObject({
      type: "failed",
    });
    loader.destroy();
  });

  it.each([
    "p2p-segment-validation-failed",
    "p2p-segment-size-mismatch",
  ] as const)(
    "goes back to HTTP at once, and spends no retry, when HTTP failed with %s",
    async (type) => {
      // The HTTP attempt went on from a peer's bytes, and they proved wrong:
      // the origin did not fail, so the request gets no P2P attempt.
      fakes.state.loadedBySomeone.add("seg-0");
      const { loader, segment, callbacks, state, status } = setup({
        httpErrorRetries: 1,
      });
      await loader.loadSegment(segment(0), callbacks);
      await flush();

      state.httpControls.get("seg-0")!.failWithError(new RequestError(type));
      await flush();

      expect(state.p2pStarted).toEqual([]);
      expect(httpOf("seg-0")).toEqual(["seg-0", "seg-0"]);
      expect(status(0)).toBe("loading");
      expect(callbacks.onError).not.toHaveBeenCalled();
      loader.destroy();
    },
  );

  it("closes a peer whose bytes an HTTP download found wrong", async () => {
    const { loader, segment, callbacks, state } = setup();
    await loader.loadSegment(segment(0), callbacks);
    await flush();

    state.httpRejectPeer.get("seg-0")!(
      "-PM0400-owner",
      "bytes-length-mismatch",
    );

    expect(state.closedPeers).toEqual([
      [segment(0).stream.runtimeId, "-PM0400-owner", "bytes-length-mismatch"],
    ]);
    loader.destroy();
  });

  it("gives the player's request its own attempts when it joins a prefetch still loading", async () => {
    // The prefetch of segment 0 failed twice, and its third HTTP attempt is
    // loading when the player asks for it. Its failures are not the
    // player's: when that attempt fails too, the request gets its P2P
    // attempt, and is not rejected.
    fakes.state.loadedBySomeone.add("seg-0");
    const { loader, segment, callbacks, startLoading, state } = setup({
      httpErrorRetries: 3,
    });
    for (let i = 0; i < 2; i++) {
      startLoading(0, "http").failWithError(httpError());
    }
    const third = startLoading(0, "http");
    expect(
      state.requests.get(segment(0))!.failedAttempts.httpAttemptsCount,
    ).toBe(2);

    await loader.loadSegment(segment(0), callbacks);
    await flush();
    third.failWithError(httpError());
    await flush();

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(state.p2pStarted).toEqual(["seg-0"]);
    loader.destroy();
  });

  it("completes from the bytes held when the HTTP attempt failed after its last one", async () => {
    // Every byte came over HTTP; the attempt then failed before its end. No
    // peer is asked, and no download is stopped to free one.
    fakes.state.loadedBySomeone.add("seg-0");
    const tried = count("SegmentRequest:peer-after-http-failure");
    const completed = count("SegmentRequest:completed-from-held-bytes");
    const { loader, segment, callbacks, startLoading, state } = setup();
    const http = startLoading(0, "http");
    state.requests.get(segment(0))!.setTotalBytes(16);
    http.addLoadedChunk(new Uint8Array(16));
    http.failWithError(httpError());

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(callbacks.onSuccess).toHaveBeenCalledTimes(1);
    expect(state.p2pStarted).toEqual([]);
    expect(state.peerFreedFor).toEqual([]);
    expect(count("SegmentRequest:peer-after-http-failure")).toBe(tried);
    expect(count("SegmentRequest:completed-from-held-bytes")).toBe(
      completed + 1,
    );
    loader.destroy();
  });

  it("leaves alone an urgent request that completes from a peer's bytes while it validates", async () => {
    // Moving it to HTTP would only start the same validation again; with a
    // slow validator and frequent passes it would never end.
    let finishValidation: (isValid: boolean) => void = () => undefined;
    const validateP2PSegment = vi.fn(
      () => new Promise<boolean>((resolve) => (finishValidation = resolve)),
    );
    const { loader, segment, callbacks, state } = setup({ validateP2PSegment });
    const peer = state.requests
      .getOrCreateRequest(segment(0))
      .start(
        { downloadSource: "p2p", peerId: "peer-x" },
        { onAbort: () => undefined },
      );
    state.requests.get(segment(0))!.setTotalBytes(16);
    peer.addLoadedChunk(new Uint8Array(16));
    state.requests.get(segment(0))!.cancel();

    await loader.loadSegment(segment(0), callbacks);
    await flush();
    expect(state.requests.get(segment(0))!.isCompletingFromHeldBytes).toBe(
      true,
    );
    loader.updatePlayback({ bufferAhead: 0, rate: 2 }); // a forced pass
    await flush();

    expect(httpOf("seg-0")).toEqual([]);
    expect(validateP2PSegment).toHaveBeenCalledTimes(1);
    finishValidation(true);
    await flush();
    expect(callbacks.onSuccess).toHaveBeenCalledTimes(1);
    loader.destroy();
  });

  it("delivers the segment the peer sends", async () => {
    fakes.state.loadedBySomeone.add("seg-0");
    const { loader, segment, callbacks, state } = setup();

    await loader.loadSegment(segment(0), callbacks);
    await flush();
    state.httpControls.get("seg-0")!.failWithError(httpError());
    await flush();
    const controls = state.p2pControls.get("seg-0")!;
    controls.addLoadedChunk(new Uint8Array(16));
    controls.completeOnSuccess();
    await flush();

    expect(callbacks.onSuccess).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(httpOf("seg-0")).toEqual(["seg-0"]);
    loader.destroy();
  });

  it("goes to HTTP again when no peer has the segment", async () => {
    const { loader, segment, callbacks, state } = setup();

    await loader.loadSegment(segment(0), callbacks);
    await flush();
    state.httpControls.get("seg-0")!.failWithError(httpError());
    await flush();

    expect(state.p2pStarted).toEqual([]);
    expect(httpOf("seg-0")).toEqual(["seg-0", "seg-0"]);
    loader.destroy();
  });

  it("tries no peer when no HTTP attempt would remain after it", async () => {
    // The last attempt is HTTP: with one HTTP attempt, the player's request
    // fails with it. P2P prefetch may fetch the segment after that.
    fakes.state.loadedBySomeone.add("seg-0");
    const tried = count("SegmentRequest:peer-after-http-failure");
    const { loader, segment, callbacks, state } = setup({
      httpErrorRetries: 1,
    });

    await loader.loadSegment(segment(0), callbacks);
    await flush();
    state.httpControls.get("seg-0")!.failWithError(httpError());
    await flush();

    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    expect(count("SegmentRequest:peer-after-http-failure")).toBe(tried);
    loader.destroy();
  });

  it("moves a P2P prefetch that followed a failed HTTP prefetch to HTTP", async () => {
    // The owner's HTTP prefetch of the segment failed, and P2P prefetch then
    // took it from a peer. That download is not the urgent request's P2P
    // attempt: when the player asks for the segment with an empty buffer, it
    // moves to HTTP, as any P2P download of an urgent request does.
    const tried = count("SegmentRequest:peer-after-http-failure");
    const { loader, segment, callbacks, startLoading, status, state } = setup();
    startLoading(0, "http").failWithError(httpError());
    startLoading(0, "p2p");

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(state.p2pAborted).toContain("seg-0");
    expect(httpOf("seg-0")).toEqual(["seg-0"]);
    expect(status(0)).toBe("loading");
    expect(count("SegmentRequest:peer-after-http-failure")).toBe(tried);
    loader.destroy();
  });

  it("keeps the P2P attempt when the player aborts and asks again", async () => {
    // Players abort and ask again on a rendition change or a retry. The peer
    // that is sending the segment keeps sending it: its bytes are not thrown
    // away for HTTP, and the new request gets no second P2P attempt.
    fakes.state.loadedBySomeone.add("seg-0");
    const tried = count("SegmentRequest:peer-after-http-failure");
    const { loader, segment, status, state } = setup();
    const first = { onSuccess: vi.fn(), onError: vi.fn() };

    await loader.loadSegment(segment(0), first);
    await flush();
    state.httpControls.get("seg-0")!.failWithError(httpError());
    await flush();
    expect(p2pOf("seg-0")).toEqual(["seg-0"]);

    loader.abortSegmentRequest("seg-0");
    const second = { onSuccess: vi.fn(), onError: vi.fn() };
    await loader.loadSegment(segment(0), second);
    await flush();

    expect(state.p2pAborted).not.toContain("seg-0");
    expect(status(0)).toBe("loading");
    expect(httpOf("seg-0")).toEqual(["seg-0"]);

    // The peer fails: HTTP again, and no second P2P attempt.
    state.p2pControls.get("seg-0")!.failWithError(peerError());
    await flush();
    expect(httpOf("seg-0")).toEqual(["seg-0", "seg-0"]);
    expect(p2pOf("seg-0")).toEqual(["seg-0"]);
    expect(count("SegmentRequest:peer-after-http-failure")).toBe(tried + 1);
    loader.destroy();
  });

  it("gives the player's next request for the segment its own P2P attempt", async () => {
    fakes.state.loadedBySomeone.add("seg-0");
    const { loader, segment, state } = setup({ httpErrorRetries: 2 });
    const first = { onSuccess: vi.fn(), onError: vi.fn() };

    await loader.loadSegment(segment(0), first);
    await flush();
    state.httpControls.get("seg-0")!.failWithError(httpError());
    await flush();
    // The peer closes, and has the segment no longer.
    state.loadedBySomeone.delete("seg-0");
    state.p2pControls.get("seg-0")!.failWithError(peerError());
    await flush();
    state.httpControls.get("seg-0")!.failWithError(httpError());
    await flush();
    expect(first.onError).toHaveBeenCalledTimes(1);

    // Another peer has it. The player retries: HTTP first, then the peer.
    state.loadedBySomeone.add("seg-0");
    const second = { onSuccess: vi.fn(), onError: vi.fn() };
    await loader.loadSegment(segment(0), second);
    await flush();
    state.httpControls.get("seg-0")!.failWithError(httpError());
    await flush();

    expect(httpOf("seg-0")).toEqual(["seg-0", "seg-0", "seg-0"]);
    expect(p2pOf("seg-0")).toEqual(["seg-0", "seg-0"]);
    loader.destroy();
  });
});

describe("HybridLoader: a download stopped with bytes in hand", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
    const { state } = fakes;
    state.peerCount = 0;
    state.loadedBySomeone.clear();
    state.httpStarted.length = 0;
    state.httpAborted.length = 0;
    state.p2pStarted.length = 0;
    state.p2pAborted.length = 0;
    state.broadcasts = 0;
    state.httpControls.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const chunk = () => new Uint8Array(100);

  it("keeps a prefetch stopped for an urgent request, and goes on from its bytes", async () => {
    // The urgent request takes the link; the prefetch of segment 5 had 100
    // bytes. They are not thrown away: when segment 5 is fetched again, the
    // same request goes on from them, with a Range from byte 100.
    const kept = count("PartialRequest:kept");
    const { loader, segment, callbacks, startLoading, status, state } = setup({
      simultaneousHttpDownloads: 3,
    });
    startLoading(5, "http").addLoadedChunk(chunk());
    const paused = state.requests.get(segment(5));

    await loader.loadSegment(segment(0), callbacks);
    await flush();
    // The next pass — here forced by a rate change — is the one that used to
    // remove the stopped request with its bytes.
    loader.updatePlayback({ bufferAhead: 0, rate: 2 });
    await flush();
    expect(status(5)).toBe("aborted");
    expect(state.requests.get(segment(5))).toBe(paused);
    expect(paused?.loadedBytes).toBe(100);
    expect(count("PartialRequest:kept")).toBe(kept + 1);

    const urgent = state.httpControls.get("seg-0")!;
    urgent.addLoadedChunk(chunk());
    urgent.completeOnSuccess();
    await flush();
    await loader.loadSegment(segment(5), {
      onSuccess: vi.fn(),
      onError: vi.fn(),
    });
    await flush();

    expect(status(5)).toBe("loading");
    expect(state.requests.get(segment(5))).toBe(paused);
    expect(paused?.loadedBytes).toBe(100);
    loader.destroy();
  });

  it("gives the player's request its own attempts on a kept download", async () => {
    // The prefetch of segment 5 failed every HTTP attempt, and a peer's
    // download of it was then stopped with bytes. With no peer holding it
    // now, the old failures left no way to load it and nothing rejected the
    // request: the player waited for them to expire.
    const { loader, segment, callbacks, startLoading, status, state } = setup({
      httpErrorRetries: 3,
    });
    for (let i = 0; i < 3; i++) {
      startLoading(5, "http").failWithError(
        new RequestError("http-error", "503"),
      );
    }
    startLoading(5, "p2p").addLoadedChunk(chunk());
    const kept = state.requests.get(segment(5))!;
    kept.cancel();
    expect(kept.failedAttempts.httpAttemptsCount).toBe(3);

    await loader.loadSegment(segment(5), callbacks);
    await flush();

    expect(state.httpStarted).toContain("seg-5");
    expect(status(5)).toBe("loading");
    expect(state.requests.get(segment(5))).toBe(kept);
    expect(kept.loadedBytes).toBe(100);
    loader.destroy();
  });

  it("removes a stopped download once its segment leaves the queue", async () => {
    const { loader, segment, callbacks, state } = setup({
      simultaneousHttpDownloads: 3,
    });
    const controls = startLoading(5);
    controls.addLoadedChunk(chunk());
    state.requests.get(segment(5))!.cancel();
    await loader.loadSegment(segment(4), callbacks);
    await flush();
    expect(state.requests.get(segment(5))?.loadedBytes).toBe(100);

    // The player moves on past segment 5: it is behind the queue now.
    await loader.loadSegment(segment(20), callbacks);
    await flush();

    expect(state.requests.get(segment(5))).toBeUndefined();
    loader.destroy();

    function startLoading(i: number) {
      return state.requests
        .getOrCreateRequest(segment(i))
        .start({ downloadSource: "http" }, { onAbort: () => undefined });
    }
  });

  it("keeps no more stopped downloads than there are slots, nearest first", async () => {
    // One HTTP slot and one P2P slot: two stopped downloads are kept, the
    // one furthest ahead is let go.
    const dropped = count("PartialRequest:dropped-over-limit");
    const { loader, segment, callbacks, state } = setup();
    for (const i of [7, 5, 6]) {
      state.requests
        .getOrCreateRequest(segment(i))
        .start({ downloadSource: "http" }, { onAbort: () => undefined })
        .addLoadedChunk(chunk());
      state.requests.get(segment(i))!.cancel();
    }

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(state.requests.get(segment(5))?.status).toBe("aborted");
    expect(state.requests.get(segment(6))?.status).toBe("aborted");
    expect(state.requests.get(segment(7))).toBeUndefined();
    expect(count("PartialRequest:dropped-over-limit")).toBe(dropped + 1);
    loader.destroy();
  });

  // A kept download holds its bytes outside the storage: the ledger shows it
  // as a PartialRequest record until it goes on, is cleared or is let go.
  const livePartials = () => ledger.snapshot()?.live.PartialRequest ?? 0;
  /** Segment 5, stopped with 100 bytes and kept by the next pass. */
  async function keptPartial() {
    const t = setup({ simultaneousHttpDownloads: 3 });
    t.startLoading(5, "http").addLoadedChunk(chunk());
    t.state.requests.get(t.segment(5))!.cancel();
    await t.loader.loadSegment(t.segment(4), t.callbacks);
    await flush();
    expect(t.status(5)).toBe("aborted");
    return t;
  }

  it("closes the record of a kept download when it goes on", async () => {
    const before = livePartials();
    const resumed = count("PartialRequest:resumed");
    const { loader, segment } = await keptPartial();
    expect(livePartials()).toBe(before + 1);

    await loader.loadSegment(segment(5), {
      onSuccess: vi.fn(),
      onError: vi.fn(),
    });
    await flush();

    expect(livePartials()).toBe(before);
    expect(count("PartialRequest:resumed")).toBe(resumed + 1);
    loader.destroy();
  });

  it("closes the record of a kept download when its segment leaves the queue", async () => {
    const before = livePartials();
    const left = count("PartialRequest:left-queue");
    const { loader, segment, callbacks, state } = await keptPartial();

    await loader.loadSegment(segment(20), callbacks);
    await flush();

    expect(state.requests.get(segment(5))).toBeUndefined();
    expect(livePartials()).toBe(before);
    expect(count("PartialRequest:left-queue")).toBe(left + 1);
    loader.destroy();
  });

  it("closes the record of a kept download whose bytes are cleared", async () => {
    // A source with a validator does not go on from another peer's bytes.
    const before = livePartials();
    const cleared = count("PartialRequest:cleared");
    const { loader, segment, state } = await keptPartial();

    state.requests.get(segment(5))!.clearLoadedBytes();

    expect(livePartials()).toBe(before);
    expect(count("PartialRequest:cleared")).toBe(cleared + 1);
    loader.destroy();
  });

  it("closes the records of kept downloads let go over the limit, or destroyed", async () => {
    const before = livePartials();
    const { loader, segment, callbacks, state } = setup();
    for (const i of [7, 5, 6]) {
      state.requests
        .getOrCreateRequest(segment(i))
        .start({ downloadSource: "http" }, { onAbort: () => undefined })
        .addLoadedChunk(chunk());
      state.requests.get(segment(i))!.cancel();
    }
    await loader.loadSegment(segment(0), callbacks);
    await flush();
    expect(livePartials()).toBe(before + 2);

    loader.destroy();
    expect(livePartials()).toBe(before);
  });

  it("announces at once when an urgent request already on HTTP stops other downloads", async () => {
    // Segment 0 was coming over HTTP as prefetch when the player asked for
    // it; segment 5 was too. Nothing else starts a download that would
    // announce, so the yield tells peers segment 5 stopped by itself.
    const { loader, segment, callbacks, startLoading, state } = setup({
      simultaneousHttpDownloads: 3,
    });
    startLoading(0, "http");
    startLoading(5, "http");
    state.broadcasts = 0;

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(state.httpAborted).toEqual(["seg-5"]);
    expect(state.broadcasts).toBeGreaterThan(0);
    loader.destroy();
  });
});

describe("HybridLoader: a download about to finish when a request is urgent", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
    const { state } = fakes;
    state.peerCount = 0;
    state.httpStarted.length = 0;
    state.httpAborted.length = 0;
    state.httpControls.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * A prefetch of segment 5 that received `loaded` of `total` bytes over
   * 0.15 s, so its speed is known: `total` undefined is a response with no
   * Content-Length.
   */
  async function prefetchOf5(loaded: number, total: number | undefined) {
    const t = setup({ simultaneousHttpDownloads: 3 });
    const controls = t.startLoading(5, "http");
    const request = t.state.requests.get(t.segment(5))!;
    if (total !== undefined) request.setTotalBytes(total);
    controls.startResponse();
    controls.addLoadedChunk(new Uint8Array(loaded));
    await new Promise((resolve) => setTimeout(resolve, 150));
    return t;
  }

  it("lets a download that will finish within a quarter second finish", async () => {
    // 9000 of 10000 bytes in 0.15 s: the last 1000 take about 0.02 s.
    // Stopped, segment 5 would be missing when the player asks for it next.
    const kept = count("Prefetch:kept-for-urgent");
    const { loader, segment, callbacks, status, state } = await prefetchOf5(
      9000,
      10000,
    );

    await loader.loadSegment(segment(0), callbacks);
    await flush();
    loader.updatePlayback({ bufferAhead: 0, rate: 2 });
    await flush();

    expect(state.httpAborted).toEqual([]);
    expect(status(5)).toBe("loading");
    expect(state.httpStarted).toEqual(["seg-0"]);
    // Counted once, though every pass judges it again.
    expect(count("Prefetch:kept-for-urgent")).toBe(kept + 1);
    loader.destroy();
  });

  it("stops a download far from its end", async () => {
    // 1000 of 1000000 bytes in 0.15 s: about 150 s left.
    const { loader, segment, callbacks, status, state } = await prefetchOf5(
      1000,
      1_000_000,
    );

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(state.httpAborted).toEqual(["seg-5"]);
    expect(status(5)).toBe("aborted");
    loader.destroy();
  });

  it("stops a download whose size is unknown", async () => {
    const { loader, segment, callbacks, state } = await prefetchOf5(
      9000,
      undefined,
    );

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(state.httpAborted).toEqual(["seg-5"]);
    loader.destroy();
  });
});

describe("HybridLoader: the start-of-stream wait for peers", () => {
  // `httpDownloadInitialTimeoutMs` holds every HTTP start back, the
  // player's urgent request and the owner's prefetch alike.
  let clock = 0;
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
    vi.useFakeTimers();
    clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const { state } = fakes;
    state.peerCount = 1;
    state.loadedBySomeone.clear();
    state.httpStarted.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const owned = segmentRanked(0);
  const WAIT = {
    httpDownloadInitialTimeoutMs: 3000,
    simultaneousHttpDownloads: 10,
  };
  /** Moves the clock and the timers to `ms`, reporting `bufferAhead`. */
  async function at(loader: HybridLoader, ms: number, bufferAhead?: number) {
    if (bufferAhead !== undefined) {
      loader.updatePlayback({ bufferAhead, rate: 1 });
    }
    vi.advanceTimersByTime(ms - clock);
    clock = ms;
    await flushMicrotasks();
  }

  it("holds the player's urgent request until the wait is over", async () => {
    const { loader, segment, callbacks, state } = setup(WAIT);
    // No report: the request is urgent.
    await loader.loadSegment(segment(0), callbacks);
    await flushMicrotasks();

    await at(loader, 2999);
    expect(state.httpStarted).toEqual([]);
    await at(loader, 3000);
    expect(state.httpStarted).toContain("seg-0");
    loader.destroy();
  });

  it("holds the owner's prefetch until the wait is over", async () => {
    // Segment 0 comes from the peer and the buffer is full: the player's
    // request takes no link, and only the election fetches over HTTP.
    fakes.state.loadedBySomeone.add("seg-0");
    const { loader, segment, callbacks, state } = setup(WAIT);
    loader.updatePlayback({ bufferAhead: 10, rate: 1 });
    await loader.loadSegment(segment(0), callbacks);
    await flushMicrotasks();

    await at(loader, 2999, 10);
    expect(state.httpStarted).toEqual([]);
    await at(loader, 3000, 10);
    expect(state.httpStarted).toContain(`seg-${owned}`);
    loader.destroy();
  });
});

describe("HybridLoader: the wait between HTTP retries", () => {
  // An origin that just failed is often still failing. A retry waits 1 s,
  // then twice as long after each failure, unless the player's request is
  // urgent; a peer may send the segment meanwhile.
  let clock = 0;
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
    clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const { state } = fakes;
    state.peerCount = 0;
    state.loadedBySomeone.clear();
    state.httpStarted.length = 0;
    state.p2pStarted.length = 0;
    state.httpControls.clear();
    state.p2pControls.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // A segment this peer owns against `peer-0`, ahead of segment 0.
  const owned = segmentRanked(0);
  const started = (id: string) =>
    fakes.state.httpStarted.filter((started) => started === id).length;
  const failHttp = async (id: string) => {
    fakes.state.httpControls
      .get(id)!
      .failWithError(new RequestError("http-error", "503"));
    await flush();
  };
  /** The peer download of `id` sends its bytes and succeeds. */
  const servePeer = async (id: string) => {
    const controls = fakes.state.p2pControls.get(id)!;
    controls.addLoadedChunk(new Uint8Array(16));
    controls.completeOnSuccess();
    await flush();
  };
  /** Moves the clock, and runs a pass as a playlist refresh does. */
  const passAt = async (
    { loader, segment }: Pick<ReturnType<typeof setup>, "loader" | "segment">,
    ms: number,
  ) => {
    clock = ms;
    loader.updatePlayback({ bufferAhead: 10, rate: 1 });
    loader.updateStream(segment(0).stream);
    await flush();
  };

  /** The owner's prefetch of `owned`, started and still loading. */
  async function prefetching(overrides: Partial<StreamConfig> = {}) {
    fakes.state.peerCount = 1;
    // Segment 0 comes from the peer, so that the player's request does not
    // take the link.
    fakes.state.loadedBySomeone.add("seg-0");
    const t = setup({
      simultaneousHttpDownloads: 10,
      simultaneousP2PDownloads: 3,
      ...overrides,
    });
    t.loader.updatePlayback({ bufferAhead: 10, rate: 1 });
    await t.loader.loadSegment(t.segment(0), t.callbacks);
    await flush();
    expect(started(`seg-${owned}`)).toBe(1);
    return { ...t, at: (ms: number) => passAt(t, ms) };
  }

  it("spreads the owner's HTTP retries: 1 s, then 2 s", async () => {
    const afterWait = count("HttpRetry:after-wait");
    const { loader, at } = await prefetching();

    await failHttp(`seg-${owned}`);
    expect(started(`seg-${owned}`)).toBe(1);
    await at(999);
    expect(started(`seg-${owned}`)).toBe(1);
    await at(1000);
    expect(started(`seg-${owned}`)).toBe(2);

    await failHttp(`seg-${owned}`);
    await at(2999);
    expect(started(`seg-${owned}`)).toBe(2);
    await at(3000);
    expect(started(`seg-${owned}`)).toBe(3);
    expect(count("HttpRetry:after-wait")).toBe(afterWait + 2);
    loader.destroy();
  });

  it("takes the segment from a peer that gets it during the wait", async () => {
    const servedByPeer = count("HttpRetry:served-by-peer");
    const { loader, at, state } = await prefetching();
    await failHttp(`seg-${owned}`);

    state.loadedBySomeone.add(`seg-${owned}`);
    await at(500);
    expect(state.p2pStarted).toContain(`seg-${owned}`);
    await servePeer(`seg-${owned}`);

    await at(1000);
    expect(started(`seg-${owned}`)).toBe(1);
    expect(count("HttpRetry:served-by-peer")).toBe(servedByPeer + 1);
    loader.destroy();
  });

  it("holds a backup's HTTP retry too", async () => {
    // A slow link brings the backup's deadline at once, while the buffer is
    // well above the urgency threshold: the request is not urgent.
    const backup = segmentRanked(1);
    fakes.state.peerCount = 1;
    const { loader, segment, callbacks, bandwidth } = setup(
      { simultaneousHttpDownloads: 10 },
      emptyStorage,
      undefined,
      backup,
    );
    const download = bandwidth.http.startLoading(clock - 1000);
    bandwidth.http.addBytes(download, 20_000);
    bandwidth.http.stopLoading(download, clock);
    const at = (ms: number) => passAt({ loader, segment }, ms);
    loader.updatePlayback({ bufferAhead: 10, rate: 1 });
    await loader.loadSegment(segment(backup), callbacks);
    await flush();
    expect(started(`seg-${backup}`)).toBe(1);

    await failHttp(`seg-${backup}`);
    await at(999);
    expect(started(`seg-${backup}`)).toBe(1);
    await at(1000);
    expect(started(`seg-${backup}`)).toBe(2);
    loader.destroy();
  });

  it("does not hold the player's request for a segment whose prefetch just failed", async () => {
    // The player's request starts with no failed attempts, so the wait the
    // prefetch started is gone, and its first attempt is no retry.
    const urgent = count("HttpRetry:urgent");
    const afterWait = count("HttpRetry:after-wait");
    const { loader, segment, callbacks } = await prefetching();
    await failHttp(`seg-${owned}`);

    clock = 200;
    loader.updatePlayback({ bufferAhead: 10, rate: 1 });
    await loader.loadSegment(segment(owned), callbacks);
    await flush();

    expect(started(`seg-${owned}`)).toBe(2);
    expect(count("HttpRetry:urgent")).toBe(urgent);
    expect(count("HttpRetry:after-wait")).toBe(afterWait);
    loader.destroy();
  });

  it("gives a prefetch new HTTP attempts 60 s after its last failure", async () => {
    // One attempt only: after the 503 the prefetch has none left.
    const { loader, at } = await prefetching({ httpErrorRetries: 1 });
    await failHttp(`seg-${owned}`);

    await at(30_000);
    expect(started(`seg-${owned}`)).toBe(1);
    await at(60_001);
    expect(started(`seg-${owned}`)).toBe(2);
    loader.destroy();
  });

  it("counts no peer's send after the HTTP attempts are spent", async () => {
    // No HTTP retry was coming: the wait had no part in it.
    const servedByPeer = count("HttpRetry:served-by-peer");
    const { loader, at, state } = await prefetching({ httpErrorRetries: 1 });
    await failHttp(`seg-${owned}`);

    state.loadedBySomeone.add(`seg-${owned}`);
    await at(500);
    await servePeer(`seg-${owned}`);

    expect(count("HttpRetry:served-by-peer")).toBe(servedByPeer);
    loader.destroy();
  });

  it("counts the urgent request's own peer attempt only as that", async () => {
    // An urgent request does not wait; its P2P attempt after an HTTP failure
    // has counters of its own.
    const servedByPeer = count("HttpRetry:served-by-peer");
    const served = count("SegmentRequest:peer-after-http-failure:served");
    fakes.state.peerCount = 1;
    fakes.state.loadedBySomeone.add("seg-0");
    const { loader, segment, callbacks, state } = setup();
    await loader.loadSegment(segment(0), callbacks);
    await flush();
    await failHttp("seg-0");
    await servePeer("seg-0");

    expect(count("SegmentRequest:peer-after-http-failure:served")).toBe(
      served + 1,
    );
    expect(count("HttpRetry:served-by-peer")).toBe(servedByPeer);
    loader.destroy();
  });

  it("counts an urgent request's retry as urgent, also after a slow peer attempt", async () => {
    // The peer attempt between the two HTTP attempts outlasts the 1 s wait;
    // the request still never waited.
    const urgent = count("HttpRetry:urgent");
    const afterWait = count("HttpRetry:after-wait");
    fakes.state.peerCount = 1;
    fakes.state.loadedBySomeone.add("seg-0");
    const { loader, segment, callbacks, state } = setup();
    await loader.loadSegment(segment(0), callbacks);
    await flush();
    await failHttp("seg-0");
    expect(state.p2pStarted).toContain("seg-0");

    clock = 1500;
    state.p2pControls
      .get("seg-0")!
      .failWithError(new RequestError("bytes-receiving-timeout"));
    await flush();

    expect(started("seg-0")).toBe(2);
    expect(count("HttpRetry:urgent")).toBe(urgent + 1);
    expect(count("HttpRetry:after-wait")).toBe(afterWait);
    loader.destroy();
  });

  it("does not hold an urgent request: its retry goes at once", async () => {
    const urgent = count("HttpRetry:urgent");
    // No report: the request is urgent, and no peer has the segment.
    const { loader, segment, callbacks } = setup();
    await loader.loadSegment(segment(0), callbacks);
    await flush();

    await failHttp("seg-0");

    expect(started("seg-0")).toBe(2);
    expect(count("HttpRetry:urgent")).toBe(urgent + 1);
    loader.destroy();
  });

  it("holds a request that is not urgent, with no peer to wait for", async () => {
    const { loader, segment, callbacks } = setup();
    loader.updatePlayback({ bufferAhead: 10, rate: 1 });
    await loader.loadSegment(segment(0), callbacks);
    await flush();
    expect(started("seg-0")).toBe(1);

    await failHttp("seg-0");
    expect(started("seg-0")).toBe(1);

    clock = 1000;
    loader.updatePlayback({ bufferAhead: 9, rate: 1 });
    // A pass, as the prefetch timer or a playlist refresh runs one.
    loader.updateStream(segment(0).stream);
    await flush();
    expect(started("seg-0")).toBe(2);
    expect(callbacks.onError).not.toHaveBeenCalled();
    loader.destroy();
  });
});

describe("HybridLoader: a nearly full storage", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
    const { state } = fakes;
    state.peerCount = 1;
    state.loadedBySomeone.clear();
    state.httpStarted.length = 0;
    state.p2pStarted.length = 0;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // 2 % free: prefetch stops, and both windows are 0 — the requested
  // segment, where the queue starts, is still in them.
  const fullStorage = {
    ...emptyStorage,
    getUsage: () => ({ totalCapacity: 100, usedCapacity: 98 }),
  } as unknown as SegmentStorage;
  // A segment this peer owns against `peer-0`, after the first.
  const owned = segmentRanked(0);

  it("prefetches nothing the player has not asked for", async () => {
    const { loader, segment, state } = setup(
      { simultaneousHttpDownloads: 3 },
      fullStorage,
      undefined,
      owned,
    );
    loader.updatePlayback({ bufferAhead: 10, rate: 1 });
    loader.updateStream(segment(owned).stream);
    await flush();

    expect(state.httpStarted).toEqual([]);
    loader.destroy();
  });

  it("still fetches the segment the player asked for, by the election", async () => {
    // The request is not urgent: 10 s buffered, a 3 s threshold, and no peer
    // has the segment. This peer is its owner, so it fetches it at once;
    // left out, the request would wait for its buffer to drain, and so would
    // every peer waiting for this owner. Nothing else is prefetched.
    const { loader, segment, callbacks, state } = setup(
      { simultaneousHttpDownloads: 3 },
      fullStorage,
      undefined,
      owned,
    );
    loader.updatePlayback({ bufferAhead: 10, rate: 1 });
    const urgent = count("SegmentRequest:urgent");

    await loader.loadSegment(segment(owned), callbacks);
    await flush();

    expect(state.httpStarted).toEqual([`seg-${owned}`]);
    expect(count("SegmentRequest:urgent")).toBe(urgent);
    loader.destroy();
  });
});

describe("HybridLoader: fetch priorities", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
    const { state } = fakes;
    state.peerCount = 0;
    state.loadedBySomeone.clear();
    state.httpStarted.length = 0;
    state.httpPriority.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks for the player's urgent request at high priority", async () => {
    const { loader, segment, callbacks, state } = setup();

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(state.httpPriority.get("seg-0")).toBe("high");
    loader.destroy();
  });

  it("prefetches at low priority, and the player's own segment at high", async () => {
    // With a peer connected, the election fetches what this peer owns. The
    // segment its player asked for, not urgent with 10 s buffered, comes
    // through the election too, and before the prefetch around it.
    fakes.state.peerCount = 1;
    const owned = Array.from({ length: 20 }, (_, i) => i).filter(
      (i) => rankForSegment("me", ["peer-0"], i) === 0,
    );
    const { loader, segment, callbacks, state } = setup(
      { simultaneousHttpDownloads: 10 },
      emptyStorage,
      undefined,
      owned[0],
    );
    loader.updatePlayback({ bufferAhead: 10, rate: 1 });

    await loader.loadSegment(segment(owned[0]), callbacks);
    await flush();

    expect(state.httpPriority.get(`seg-${owned[0]}`)).toBe("high");
    const prefetched = state.httpStarted.filter(
      (id) => id !== `seg-${owned[0]}`,
    );
    expect(prefetched.length).toBeGreaterThan(0);
    for (const id of prefetched) {
      expect(state.httpPriority.get(id)).toBe("low");
    }
    loader.destroy();
  });
});

describe("HybridLoader: counting how the P2P attempt after an HTTP failure goes", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
    const { state } = fakes;
    state.peerCount = 1;
    state.loadedBySomeone.clear();
    state.httpStarted.length = 0;
    state.p2pStarted.length = 0;
    state.freePeerStops = false;
    state.p2pRefuses = false;
    state.p2pFailsAtOnce = false;
    state.httpControls.clear();
    state.p2pControls.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const ways = [
    "served",
    "failed",
    "aborted",
    "no-peer",
    "no-free-peer",
  ] as const;
  const counts = () => ({
    ...Object.fromEntries(
      ways.map((way) => [
        way,
        count(`SegmentRequest:peer-after-http-failure:${way}`),
      ]),
    ),
    freed: count("Prefetch:peer-freed-for-urgent"),
  });
  const delta = (before: ReturnType<typeof counts>) => {
    const after = counts();
    return Object.fromEntries(
      Object.entries(after)
        .map(([key, value]) => [
          key,
          value - before[key as keyof typeof before],
        ])
        .filter(([, value]) => value !== 0),
    );
  };

  /** An urgent request for segment 0 whose first HTTP attempt fails. */
  async function afterHttpFailure() {
    const t = setup();
    await t.loader.loadSegment(t.segment(0), t.callbacks);
    await flush();
    t.state.httpControls
      .get("seg-0")!
      .failWithError(new RequestError("http-error", "503"));
    await flush();
    return t;
  }

  it("counts an attempt the peer serves", async () => {
    fakes.state.loadedBySomeone.add("seg-0");
    const before = counts();
    const { loader, state } = await afterHttpFailure();
    const controls = state.p2pControls.get("seg-0")!;
    controls.addLoadedChunk(new Uint8Array(16));
    controls.completeOnSuccess();
    await flush();

    expect(delta(before)).toEqual({ served: 1 });
    loader.destroy();
  });

  it("goes on over HTTP at once when the peer fails the attempt at once", async () => {
    // The peer's channel is closing: the attempt fails before downloadSegment
    // returns, in a pass that has handled the settled requests already.
    fakes.state.loadedBySomeone.add("seg-0");
    fakes.state.p2pFailsAtOnce = true;
    const before = counts();
    const { loader, state } = await afterHttpFailure();

    expect(state.p2pStarted).toEqual(["seg-0"]);
    expect(state.httpStarted.filter((id) => id === "seg-0")).toHaveLength(2);
    expect(delta(before)).toEqual({ failed: 1 });

    // The attempt kept its tag: the next HTTP failure gets no second one.
    state.p2pFailsAtOnce = false;
    state.httpControls
      .get("seg-0")!
      .failWithError(new RequestError("http-error", "503"));
    await flush();
    expect(state.p2pStarted).toEqual(["seg-0"]);
    expect(state.httpStarted.filter((id) => id === "seg-0")).toHaveLength(3);
    loader.destroy();
  });

  it("counts an attempt the peer fails, once", async () => {
    fakes.state.loadedBySomeone.add("seg-0");
    const before = counts();
    const { loader, state } = await afterHttpFailure();
    state.p2pControls
      .get("seg-0")!
      .failWithError(new RequestError("peer-closed"));
    await flush();
    loader.updatePlayback({ bufferAhead: 0, rate: 2 });
    await flush();

    expect(delta(before)).toEqual({ failed: 1 });
    loader.destroy();
  });

  it("counts an attempt the player gives up", async () => {
    // The player leaves the segment: its request is aborted, and the
    // segment leaves the queue, which stops the attempt.
    fakes.state.loadedBySomeone.add("seg-0");
    const before = counts();
    const { loader, segment, callbacks } = await afterHttpFailure();
    loader.abortSegmentRequest("seg-0");
    await loader.loadSegment(segment(20), callbacks);
    await flush();

    expect(delta(before)).toEqual({ aborted: 1 });
    loader.destroy();
  });

  it("counts an attempt that does not start because no peer has the segment", async () => {
    const before = counts();
    const { loader } = await afterHttpFailure();

    expect(delta(before)).toEqual({ "no-peer": 1 });
    loader.destroy();
  });

  it("counts an attempt that does not start because no peer is free", async () => {
    fakes.state.loadedBySomeone.add("seg-0");
    fakes.state.p2pRefuses = true;
    const before = counts();
    const { loader } = await afterHttpFailure();

    expect(delta(before)).toEqual({ "no-free-peer": 1 });
    loader.destroy();
  });

  it("counts the download it stops to free a peer", async () => {
    fakes.state.loadedBySomeone.add("seg-0");
    fakes.state.freePeerStops = true;
    const before = counts();
    const { loader } = await afterHttpFailure();

    expect(delta(before)).toEqual({ freed: 1 });
    loader.destroy();
  });
});

describe("HybridLoader: a request that settles during a pass", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
    const { state } = fakes;
    state.peerCount = 1;
    state.loadedBySomeone.clear();
    state.httpStarted.length = 0;
    state.p2pStarted.length = 0;
    state.p2pRefuses = false;
    state.p2pFailsAtOnce = false;
    state.p2pCompletesAtOnce = false;
    state.p2pAtOnce.clear();
    state.onP2PStart = undefined;
    state.httpControls.clear();
    state.p2pControls.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("delivers a segment that a peer sends at once, with no other event", async () => {
    // The pass handles the settled requests before it starts the player's
    // download, so the download that succeeds at once is handled by the one
    // more pass that follows.
    fakes.state.p2pCompletesAtOnce = true;
    const { loader, segment, callbacks, state } = setup();
    loader.updatePlayback({ bufferAhead: 10, rate: 1 });
    await flush();
    // The peer has it from now on: no prefetch took it before the player.
    state.loadedBySomeone.add("seg-1");
    const after = count("QueuePass:after-settle");

    await loader.loadSegment(segment(1), callbacks);
    await flush();

    expect(state.p2pStarted).toEqual(["seg-1"]);
    expect(callbacks.onSuccess).toHaveBeenCalledTimes(1);
    expect(count("QueuePass:after-settle")).toBe(after + 1);
    loader.destroy();
  });

  it("handles a success in a follow-up pass, though failures there get no more passes", async () => {
    // Segment 3 fails at once in every pass, which limits the passes. When
    // it first starts, a peer gets segment 2, which then succeeds at once in
    // the follow-up pass: a request the player may be waiting for.
    const { loader, segment, state } = setup();
    loader.updatePlayback({ bufferAhead: 10, rate: 1 });
    await flush();
    state.loadedBySomeone.add("seg-3");
    state.p2pAtOnce.set("seg-3", "fail");
    state.onP2PStart = (id) => {
      if (id !== "seg-3") return;
      state.loadedBySomeone.add("seg-2");
      state.p2pAtOnce.set("seg-2", "succeed");
    };

    loader.updatePlayback({ bufferAhead: 10, rate: 2 });
    await flush();

    expect(state.p2pStarted).toContain("seg-2");
    // Handled — stored and removed — with no other event.
    expect(state.requests.get(segment(2))).toBeUndefined();
    loader.destroy();
  });

  it("runs one more pass, not more, when a download fails at once in each pass", async () => {
    // A peer whose channel is closing fails the prefetch in every pass.
    // Each pass asking for the next would never end.
    fakes.state.loadedBySomeone.add("seg-2");
    fakes.state.p2pFailsAtOnce = true;
    const { loader, state } = setup();
    loader.updatePlayback({ bufferAhead: 10, rate: 1 });
    await flush();
    const after = count("QueuePass:after-settle");
    const limited = count("QueuePass:after-settle:limited");
    const started = state.p2pStarted.length;

    loader.updatePlayback({ bufferAhead: 10, rate: 2 });
    await flush();

    expect(state.p2pStarted.length - started).toBe(2);
    expect(count("QueuePass:after-settle")).toBe(after + 1);
    expect(count("QueuePass:after-settle:limited")).toBe(limited + 1);
    loader.destroy();
  });
});
