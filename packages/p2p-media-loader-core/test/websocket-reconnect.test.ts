import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocketClient } from "../src/webtorrent/websocket-client/index.js";

const INITIAL_DELAY = 1000;
const MAX_DELAY = 8000;

/** The sockets the client opened, newest last. */
let sockets: FakeWebSocket[] = [];

class FakeWebSocket {
  binaryType = "";
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: (() => void) | null = null;

  constructor(readonly url: string) {
    sockets.push(this);
  }

  close(): void {
    this.onclose?.();
  }
}

/**
 * The time from a socket closing until the client opens the next one. Jitter
 * is off, so the timers fire at exactly the scheduled delay.
 */
function delayUntilNextSocket(): number {
  const opened = sockets.length;
  let waited = 0;
  while (sockets.length === opened && waited <= MAX_DELAY * 4) {
    vi.advanceTimersByTime(100);
    waited += 100;
  }
  return waited;
}

function newClient() {
  const client = new WebSocketClient({
    url: "wss://tracker.example/announce",
    initialDelay: INITIAL_DELAY,
    maxDelay: MAX_DELAY,
    jitterMultiplier: 0,
  });
  client.connect();
  return client;
}

const lastSocket = () => sockets[sockets.length - 1];

describe("WebSocketClient reconnect backoff", () => {
  beforeEach(() => {
    sockets = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("backs off when a tracker accepts the connection and drops it at once", () => {
    const client = newClient();

    const delays: number[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const socket = lastSocket();
      socket.onopen?.();
      socket.close();
      delays.push(delayUntilNextSocket());
    }

    expect(delays).toEqual([
      INITIAL_DELAY,
      INITIAL_DELAY * 2,
      INITIAL_DELAY * 4,
    ]);
    client.dispose();
  });

  it("starts over once a connection has lasted", () => {
    const client = newClient();

    for (let attempt = 0; attempt < 3; attempt++) {
      const socket = lastSocket();
      socket.onopen?.();
      socket.close();
      delayUntilNextSocket();
    }

    const socket = lastSocket();
    socket.onopen?.();
    vi.advanceTimersByTime(MAX_DELAY);
    socket.close();

    expect(delayUntilNextSocket()).toBe(INITIAL_DELAY);
    client.dispose();
  });

  it("keeps backing off while the connection never opens", () => {
    const client = newClient();

    const delays: number[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      lastSocket().close();
      delays.push(delayUntilNextSocket());
    }

    expect(delays).toEqual([INITIAL_DELAY, INITIAL_DELAY * 2]);
    client.dispose();
  });
});
