import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebTorrentSocketPool } from "../src/webtorrent/webtorrent-socket-pool/index.js";

const TRACKER = "wss://tracker.example/announce";

/** Every socket the pool opened, oldest first. */
let sockets: FakeWebSocket[] = [];

class FakeWebSocket {
  binaryType = "";
  closed = false;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: (() => void) | null = null;

  constructor(readonly url: string) {
    sockets.push(this);
  }

  close(): void {
    this.closed = true;
  }
}

describe("WebTorrentSocketPool", () => {
  beforeEach(() => {
    sockets = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("closes every socket it holds", () => {
    const pool = new WebTorrentSocketPool();
    pool.acquire(TRACKER);
    pool.acquire("wss://other.example/announce");

    pool.closeAllSockets();

    expect(sockets.map((socket) => socket.closed)).toEqual([true, true]);
  });

  it("keeps its listeners, so a core that reset itself still hears socket errors", () => {
    // A core resets between sources and keeps its pool, subscribing to its
    // errors once. Closing the sockets must not take that subscription with
    // them, or every source after the first fails without a log line.
    const pool = new WebTorrentSocketPool();
    const errors: string[] = [];
    pool.addEventListener("error", (_error, url) => errors.push(url));

    pool.acquire(TRACKER);
    pool.closeAllSockets();
    pool.acquire(TRACKER);
    sockets[sockets.length - 1].onerror?.(new Event("error"));

    expect(errors).toEqual([TRACKER]);
  });

  it("opens a new socket for a tracker after closing the old one", () => {
    const pool = new WebTorrentSocketPool();
    const first = pool.acquire(TRACKER).client;

    pool.closeAllSockets();
    const second = pool.acquire(TRACKER).client;

    expect(second).not.toBe(first);
    expect(sockets).toHaveLength(2);
  });
});
