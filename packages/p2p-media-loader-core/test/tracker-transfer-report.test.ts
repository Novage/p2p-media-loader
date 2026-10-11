import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WebTorrentClient,
  type TransferredBytes,
} from "../src/webtorrent/webtorrent-client/index.js";
import type { WebSocketClient } from "../src/webtorrent/websocket-client/index.js";

// Offers that complete at once, so that each announce goes out with no wait.
vi.mock("../src/webtorrent/webtorrent-client/webrtc-utils.js", () => ({
  PeerConnection: class {
    iceGatheringState = "complete";
    localDescription = { type: "offer", sdp: "v=0" };
    createDataChannel = () => ({
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      close: () => undefined,
    });
    addEventListener() {}
    removeEventListener() {}
    close() {}
  },
  SessionDescription: class {},
  safeCreateOffer: () => Promise.resolve({ type: "offer", sdp: "v=0" }),
  safeCreateAnswer: () => Promise.resolve({ type: "answer", sdp: "v=0" }),
  safeSetLocalDescription: () => Promise.resolve(),
  safeSetRemoteDescription: () => Promise.resolve(),
}));

function startClient(transferred: TransferredBytes) {
  const sent: Record<string, unknown>[] = [];
  const wsClient = {
    state: "connected",
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    send: (data: string) => sent.push(JSON.parse(data) as never),
  } as unknown as WebSocketClient;
  const client = new WebTorrentClient({
    wsClient,
    infoHash: "info-hash-0123456789",
    peerId: "-PM0500-llllllllllll",
    offersCount: () => 1,
    transferredBytes: () => transferred,
  });
  client.start();
  const announces = () =>
    sent.filter((message) => message.action === "announce");
  return { client, announces };
}

describe("WebTorrentClient: bytes reported to the tracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the swarm's totals as they are at each announce, and the last ones with stopped", async () => {
    const transferred = { uploaded: 0, downloaded: 0 };
    const { client, announces } = startClient(transferred);
    await vi.advanceTimersByTimeAsync(0);
    expect(announces()[0]).toMatchObject({
      event: "started",
      uploaded: 0,
      downloaded: 0,
    });

    transferred.downloaded = 3_000_000;
    transferred.uploaded = 1_000_000;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(announces()[1]).toMatchObject({
      uploaded: 1_000_000,
      downloaded: 3_000_000,
    });

    transferred.downloaded = 4_000_000;
    client.destroy();
    expect(announces().at(-1)).toMatchObject({
      event: "stopped",
      uploaded: 1_000_000,
      downloaded: 4_000_000,
    });
  });
});
