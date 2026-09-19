import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestsContainer } from "../src/requests/request-container.js";
import type {
  SegmentWithStream,
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
      this.request.start(
        { downloadSource: "http" },
        { onAbort: () => state.httpAborted.push(id) },
      );
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

const SEGMENT_DURATION = 4;

function createStream(segmentCount: number): StreamWithSegments {
  const stream = {
    runtimeId: "https://cdn.example/v/720p/index.m3u8",
    type: "main",
    properties: { bitrate: 1_000_000 },
    swarmId: "https://cdn.example/v/master.m3u8",
    identityHash: "id",
    streamSwarmId: "v3-swarm-main-id",
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

function setup(
  configOverrides: Partial<StreamConfig> = {},
  storage: SegmentStorage = emptyStorage,
) {
  const stream = createStream(30);
  const segment = (i: number) => stream.segments.get(`seg-${i}`)!;
  const config: StreamConfig = {
    ...Core.DEFAULT_STREAM_CONFIG,
    simultaneousHttpDownloads: 1,
    simultaneousP2PDownloads: 1,
    // Shorter than a segment: only the requested segment is high-demand, so
    // a test sees one slot being fought over, not a cascade.
    highDemandTimeWindow: 3,
    httpDownloadTimeWindow: 40,
    p2pDownloadTimeWindow: 60,
    httpDownloadInitialTimeoutMs: 0,
    ...configOverrides,
  };
  const loader = new HybridLoader(
    segment(0),
    { isLive: false },
    config,
    { all: new BandwidthCalculator(), http: new BandwidthCalculator() },
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
  return { loader, segment, callbacks, startLoading, status, state };
}

describe("HybridLoader: making room for a high-demand segment", () => {
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

  it("aborts the last HTTP download after the segment in the queue, keeping earlier ones", async () => {
    const { loader, segment, callbacks, startLoading, status, state } = setup();
    // Two HTTP downloads further down the queue already hold the one slot
    // (the container counts them both; the limit only gates new starts).
    startLoading(5, "http");
    startLoading(8, "http");

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(state.httpAborted).toEqual(["seg-8"]);
    expect(status(8)).toBe("aborted");
    expect(status(5)).toBe("loading");
    expect(state.httpStarted).toEqual(["seg-0"]);
    expect(status(0)).toBe("loading");
    loader.destroy();
  });

  it("only aborts downloads of the source it needs a slot for", async () => {
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
    // httpErrorRetries 0: no HTTP attempt is ever allowed, so the high-demand
    // segment can only go through a peer that has it.
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

  it("never aborts a download ahead of the segment in the queue", async () => {
    const { loader, segment, callbacks, startLoading, status, state } = setup({
      // Two high-demand segments this time: 3 and 4.
      highDemandTimeWindow: 6,
    });
    // The player seeks to segment 3, which is already downloading over HTTP
    // and holds the only slot. Segment 4 is high-demand too, but the only
    // HTTP download in the queue is ahead of it, so it must wait.
    startLoading(3, "http");

    await loader.loadSegment(segment(3), callbacks);
    await flush();

    expect(state.httpAborted).toEqual([]);
    expect(status(3)).toBe("loading");
    expect(state.httpStarted).toEqual([]);
    expect(status(4)).toBeUndefined();
    loader.destroy();
  });

  it("does not abort anything while a slot is free", async () => {
    const { loader, segment, callbacks, startLoading, status, state } = setup({
      simultaneousHttpDownloads: 2,
    });
    startLoading(8, "http");

    await loader.loadSegment(segment(0), callbacks);
    await flush();

    expect(state.httpAborted).toEqual([]);
    expect(status(8)).toBe("loading");
    expect(state.httpStarted).toEqual(["seg-0"]);
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
