import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebTorrentClient } from "../src/webtorrent/webtorrent-client/index.js";
import type { WebSocketClient } from "../src/webtorrent/websocket-client/index.js";

/**
 * A connection whose signaling and ICE gathering complete at once, and whose
 * data channel never opens: each handshake ends at its connection timeout.
 */
vi.mock("../src/webtorrent/webtorrent-client/webrtc-utils.js", () => {
  const channel = () => ({
    readyState: "connecting",
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    close: () => undefined,
  });
  return {
    PeerConnection: class {
      iceGatheringState = "complete";
      iceConnectionState = "checking";
      signalingState = "stable";
      localDescription = { type: "offer", sdp: "v=0" };
      createDataChannel = channel;
      addEventListener() {}
      removeEventListener() {}
      close() {}
    },
    SessionDescription: class {
      constructor(readonly init: RTCSessionDescriptionInit) {}
    },
    safeCreateOffer: () => Promise.resolve({ type: "offer", sdp: "v=0" }),
    safeCreateAnswer: () => Promise.resolve({ type: "answer", sdp: "v=0" }),
    safeSetLocalDescription: () => Promise.resolve(),
    safeSetRemoteDescription: () => Promise.resolve(),
  };
});

const INFO_HASH = "info-hash-0123456789";
const REMOTE = "-PM0500-rrrrrrrrrrrr";
const CONNECTION_TIMEOUT = 15000;

function startClient() {
  let onMessage: ((data: string) => void) | undefined;
  const sent: Record<string, unknown>[] = [];
  const wsClient = {
    state: "connected",
    addEventListener: (name: string, listener: (data: string) => void) => {
      if (name === "message") onMessage = listener;
    },
    removeEventListener: () => undefined,
    send: (data: string) => sent.push(JSON.parse(data) as never),
  } as unknown as WebSocketClient;

  const client = new WebTorrentClient({
    wsClient,
    infoHash: INFO_HASH,
    peerId: "-PM0500-llllllllllll",
    offersCount: () => 1,
    connectionTimeout: () => CONNECTION_TIMEOUT,
  });
  const failed = vi.fn();
  client.addEventListener("peerConnectFailed", failed);
  client.start();

  const receive = (message: Record<string, unknown>) =>
    onMessage?.(
      JSON.stringify({ info_hash: INFO_HASH, peer_id: REMOTE, ...message }),
    );
  return { client, sent, failed, receive };
}

describe("WebTorrentClient connection timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives the offerer the connection timeout from the answer it receives", async () => {
    const { client, sent, failed, receive } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    const offers = sent[0].offers as { offer_id: string }[];

    receive({
      offer_id: offers[0].offer_id,
      answer: { type: "answer", sdp: "v=0" },
    });
    await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT - 1);
    expect(failed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(failed).toHaveBeenCalledOnce();
    client.destroy();
  });

  it("gives the answerer 5 s more, for the tracker to deliver its answer", async () => {
    const { client, sent, failed, receive } = startClient();
    await vi.advanceTimersByTimeAsync(0);

    receive({ offer_id: "remote-offer", offer: { type: "offer", sdp: "v=0" } });
    await vi.advanceTimersByTimeAsync(0);
    expect(sent.some((message) => message.to_peer_id === REMOTE)).toBe(true);

    await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT + 5000 - 1);
    expect(failed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(failed).toHaveBeenCalledOnce();
    expect((failed.mock.calls[0][0] as { error: Error }).error.message).toBe(
      "Data channel open timeout",
    );
    client.destroy();
  });
});
