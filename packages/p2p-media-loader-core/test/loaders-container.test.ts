import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P2PLoadersContainer } from "../src/p2p/loaders-container.js";
import { RequestsContainer } from "../src/requests/request-container.js";
import { WebTorrentSocketPool } from "../src/webtorrent/webtorrent-socket-pool/index.js";
import { BandwidthCalculator } from "../src/bandwidth-calculator.js";
import { EventTarget } from "../src/utils/event-target.js";
import { Core } from "../src/core.js";
import type {
  CoreEventMap,
  SegmentStorage,
  StreamConfig,
} from "../src/index.js";
import type { StreamWithSegments } from "../src/internal-types.js";
import debug from "debug";
import { diagnostics as compiledLedger } from "../src/diagnostics.js";

// Absent only in a prebuilt bundle; the tests run on the source.
if (!compiledLedger) throw new Error("diagnostics are compiled out");
const diagnostics = compiledLedger;

// The ledger decides once, at its first record. Turning the namespace off
// again after that keeps the ledger on and the anomalies these tests cause
// out of the output.
debug.enable("p2pml:diagnostics");
diagnostics.snapshot();
debug.disable();

const TRACKER = "wss://tracker.example/announce";

/** Every socket the pool opened, oldest first. */
let sockets: FakeWebSocket[] = [];

/**
 * Enough of a WebSocket for the pool's client to open and close one. It never
 * connects, which is all these tests need: the pool counts holders whatever
 * the connection's state.
 */
class FakeWebSocket {
  binaryType = "";
  closed = false;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: (() => void) | null = null;

  constructor(readonly url: string) {
    sockets.push(this);
  }

  close(): void {
    this.closed = true;
  }
}

/** A pool whose next acquisition can be made to fail. */
class FlakyPool extends WebTorrentSocketPool {
  failNext = false;

  override acquire(url: string) {
    if (this.failNext) throw new Error("no socket for you");
    return super.acquire(url);
  }
}

function stream(id: string): StreamWithSegments {
  return {
    runtimeId: id,
    type: "main",
    properties: { bitrate: 0 },
    swarmId: "swarm",
    streamSwarmId: `swarm-${id}`,
    infoHash: `info-${id}`,
    identityHash: id,
    segments: new Map(),
  } as unknown as StreamWithSegments;
}

function setup() {
  const stored: number[] = [];
  const storage = {
    getStoredSegmentIds: () => stored,
    hasSegment: () => false,
  } as unknown as SegmentStorage;
  const config: StreamConfig = {
    ...Core.DEFAULT_STREAM_CONFIG,
    announceTrackers: [TRACKER],
  };
  const eventTarget = new EventTarget<CoreEventMap>();
  const requests = new RequestsContainer(
    () => {},
    { all: new BandwidthCalculator(), http: new BandwidthCalculator() },
    eventTarget,
  );
  const pool = new FlakyPool();
  const container = new P2PLoadersContainer(
    stream("a"),
    requests,
    storage,
    config,
    pool,
    eventTarget,
    "-PM0500-aaaaaaaaaaaa",
    () => {},
  );
  return { container, pool, stored };
}

describe("P2PLoadersContainer switching streams", () => {
  beforeEach(() => {
    sockets = [];
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the tracker socket open across a switch made before anything was stored", () => {
    // A player settling on a rendition at startup: the stream it leaves has
    // nothing stored, so its loader goes at once. Letting it go before the next
    // one held the socket would close the connection and open another — a TLS
    // handshake per tracker, and no announce for the new swarm meanwhile.
    const { container } = setup();
    expect(sockets).toHaveLength(1);

    container.changeCurrentLoader(stream("b"));

    expect(sockets).toHaveLength(1);
    expect(sockets[0].closed).toBe(false);
  });

  it("still lets the previous loader go", () => {
    const { container } = setup();
    const first = container.currentLoader;

    container.changeCurrentLoader(stream("b"));
    expect(container.currentLoader).not.toBe(first);

    // The socket closes when its last holder lets go, so it closing here
    // means the previous loader released its hold rather than leaking it.
    container.destroy();
    expect(sockets[0].closed).toBe(true);
  });

  it("leaves the current loader in place when the next one fails to build", () => {
    const { container, pool } = setup();
    const first = container.currentLoader;

    pool.failNext = true;
    expect(() => container.changeCurrentLoader(stream("b"))).toThrow(
      "no socket for you",
    );

    // Still current, and still holding its socket: not current and destroyed.
    expect(container.currentLoader).toBe(first);
    expect(sockets[0].closed).toBe(false);
  });

  it("changes nothing when switched to the stream already current", () => {
    const { container } = setup();
    const first = container.currentLoader;

    container.changeCurrentLoader(stream("a"));

    expect(container.currentLoader).toBe(first);
    expect(sockets).toHaveLength(1);
    expect(sockets[0].closed).toBe(false);
  });

  it("leaves no loader, tracker client or socket open once destroyed", () => {
    // Other tests here leave their containers alive, so this compares the
    // ledger with itself rather than with zero.
    diagnostics.clearAnomalies();
    const before = diagnostics.snapshot()?.live;
    const { container } = setup();

    container.changeCurrentLoader(stream("b"));
    container.changeCurrentLoader(stream("c"));
    container.destroy();

    const after = diagnostics.snapshot();
    expect(after?.live).toEqual(before);
    expect(after?.anomalies).toEqual([]);
  });
});
