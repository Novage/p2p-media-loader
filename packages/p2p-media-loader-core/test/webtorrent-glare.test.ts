import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebTorrentManager } from "../src/webtorrent/webtorrent-manager/index.js";
import type { PeerHandshake } from "../src/webtorrent/webtorrent-client/index.js";
import type { WebTorrentSocketPool } from "../src/webtorrent/webtorrent-socket-pool/index.js";

type Listener = (event: unknown) => void;

/**
 * Stands in for the tracker client: it keeps the `claimPeer` the manager
 * hands it, and lets a test end a handshake as the real client would.
 */
type FakeClient = {
  claimPeer: (peerId: string, handshake: PeerHandshake) => boolean;
  emit: (name: string, event: unknown) => void;
};

const { clients } = vi.hoisted(() => ({ clients: new Array<FakeClient>() }));

vi.mock("../src/webtorrent/webtorrent-client/index.js", () => ({
  WebTorrentClient: class {
    readonly listeners = new Map<string, Set<Listener>>();
    readonly claimPeer: FakeClient["claimPeer"];

    constructor(config: { claimPeer: FakeClient["claimPeer"] }) {
      this.claimPeer = config.claimPeer;
      clients.push(this);
    }

    addEventListener(name: string, listener: Listener) {
      let set = this.listeners.get(name);
      if (!set) this.listeners.set(name, (set = new Set()));
      set.add(listener);
    }

    removeEventListener(name: string, listener: Listener) {
      this.listeners.get(name)?.delete(listener);
    }

    emit(name: string, event: unknown) {
      for (const listener of this.listeners.get(name) ?? []) listener(event);
    }

    start = vi.fn();
    destroy = vi.fn();
  },
}));

const LOWER = "-PM0500-AAAAAAAAAAAA";
const HIGHER = "-PM0500-zzzzzzzzzzzz";

const socketPool = {
  acquire: () => ({ client: {}, release: vi.fn() }),
} as unknown as WebTorrentSocketPool;

/** A manager for `peerId`, and the claim of the one tracker client it starts. */
function startManager(peerId: string) {
  const manager = new WebTorrentManager({
    infoHash: "info-hash-0123456789",
    peerId,
    trackerUrls: ["wss://tracker.example/announce"],
    socketPool,
  });
  manager.start();
  const client = clients[clients.length - 1];
  return { manager, client };
}

function handshake(role: PeerHandshake["role"]) {
  return { role, cancel: vi.fn() };
}

/** A connection that reports itself open, and whether it was closed. */
function fakeConnection() {
  const close = vi.fn();
  const connection = {
    iceConnectionState: "connected",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close,
  } as unknown as RTCPeerConnection;
  return { connection, close };
}

function fakeChannel() {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn(),
  } as unknown as RTCDataChannel;
}

describe("WebTorrentManager glare", () => {
  beforeEach(() => {
    clients.length = 0;
  });

  it("keeps the same handshake on both peers when each answers the other's offer", () => {
    const lower = startManager(LOWER);
    const higher = startManager(HIGHER);

    // Each answers the other's offer: the higher's offer X, the lower's offer Y.
    const lowerAnswersX = handshake("answerer");
    const higherAnswersY = handshake("answerer");
    expect(lower.client.claimPeer(HIGHER, lowerAnswersX)).toBe(true);
    expect(higher.client.claimPeer(LOWER, higherAnswersY)).toBe(true);

    // Then each receives the answer to its own offer.
    const lowerOffersY = handshake("offerer");
    const higherOffersX = handshake("offerer");
    expect(lower.client.claimPeer(HIGHER, lowerOffersY)).toBe(true);
    expect(higher.client.claimPeer(LOWER, higherOffersX)).toBe(false);

    // Both are left with Y, the lower peer's offer.
    expect(lowerAnswersX.cancel).toHaveBeenCalledOnce();
    expect(higherAnswersY.cancel).not.toHaveBeenCalled();
  });

  it("reports neither the handshake it gave up nor a connection it made regardless", () => {
    const { manager, client } = startManager(LOWER);
    const connected = vi.fn();
    const failed = vi.fn();
    manager.addEventListener("peerConnected", connected);
    manager.addEventListener("peerConnectFailed", failed);

    const answering = handshake("answerer");
    const offering = handshake("offerer");
    client.claimPeer(HIGHER, answering);
    client.claimPeer(HIGHER, offering);

    client.emit("peerConnectFailed", {
      peerId: HIGHER,
      error: new Error("Handshake abandoned"),
      handshake: answering,
    });
    expect(failed).not.toHaveBeenCalled();

    const stray = fakeConnection();
    client.emit("peerConnected", {
      peerId: HIGHER,
      connection: stray.connection,
      channel: fakeChannel(),
      handshake: answering,
    });
    expect(stray.close).toHaveBeenCalledOnce();
    expect(connected).not.toHaveBeenCalled();

    client.emit("peerConnected", {
      peerId: HIGHER,
      connection: fakeConnection().connection,
      channel: fakeChannel(),
      handshake: offering,
    });
    expect(connected).toHaveBeenCalledOnce();
  });

  it("turns away every other duplicate", () => {
    const { client } = startManager(LOWER);

    const offering = handshake("offerer");
    expect(client.claimPeer(HIGHER, offering)).toBe(true);
    expect(client.claimPeer(HIGHER, handshake("answerer"))).toBe(false);
    expect(client.claimPeer(HIGHER, handshake("offerer"))).toBe(false);
    expect(offering.cancel).not.toHaveBeenCalled();

    const other = "-PM0500-mmmmmmmmmmmm";
    const answering = handshake("answerer");
    expect(client.claimPeer(other, answering)).toBe(true);
    expect(client.claimPeer(other, handshake("answerer"))).toBe(false);
    expect(answering.cancel).not.toHaveBeenCalled();
  });

  it("releases the claim when the handshake that holds it fails", () => {
    const { manager, client } = startManager(LOWER);
    const failed = vi.fn();
    manager.addEventListener("peerConnectFailed", failed);

    const answering = handshake("answerer");
    client.claimPeer(HIGHER, answering);
    client.emit("peerConnectFailed", {
      peerId: HIGHER,
      error: new Error("ICE connection disconnected"),
      handshake: answering,
    });

    expect(failed).toHaveBeenCalledOnce();
    expect(client.claimPeer(HIGHER, handshake("answerer"))).toBe(true);
  });
});
