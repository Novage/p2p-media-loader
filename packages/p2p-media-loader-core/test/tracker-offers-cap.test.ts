import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import debug from "debug";
import { WebTorrentClient } from "../src/webtorrent/webtorrent-client/index.js";
import type { WebSocketClient } from "../src/webtorrent/websocket-client/index.js";
import { diagnostics as compiledLedger } from "../src/diagnostics.js";

// Offers that complete at once, so that each announce goes out with no wait,
// unless a test makes them gather for a time.
const gathering = vi.hoisted(() => ({ delayMs: 0 }));
// The peer connections closed so far.
const connections = vi.hoisted(() => ({ closed: 0 }));
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
    close() {
      connections.closed++;
    }
  },
  SessionDescription: class {},
  safeCreateOffer: () =>
    new Promise((resolve) => {
      const offer = { type: "offer", sdp: "v=0" };
      if (gathering.delayMs === 0) resolve(offer);
      else setTimeout(() => resolve(offer), gathering.delayMs);
    }),
  safeCreateAnswer: () => Promise.resolve({ type: "answer", sdp: "v=0" }),
  safeSetLocalDescription: () => Promise.resolve(),
  safeSetRemoteDescription: () => Promise.resolve(),
}));

// The ledger decides once, at its first record: on, for the whole file.
debug.enable("p2pml:diagnostics");
compiledLedger?.snapshot();
debug.disable();
const counter = (name: string) =>
  compiledLedger?.snapshot()?.counters[`TrackerAnnounce:${name}`] ?? 0;

const INFO_HASH = "info-hash-0123456789";

/** A client on a connected socket the test drives: it sends, and replies. */
function startClient(shouldGenerateOffers = () => true) {
  const sent: Record<string, unknown>[] = [];
  const listeners = new Map<string, ((data?: unknown) => void)[]>();
  const wsClient = {
    state: "connected",
    addEventListener: (name: string, listener: (data?: unknown) => void) =>
      listeners.set(name, [...(listeners.get(name) ?? []), listener]),
    removeEventListener: () => undefined,
    send: (data: string) => sent.push(JSON.parse(data) as never),
  } as unknown as WebSocketClient & { state: string };
  const emit = (name: string, data?: unknown) =>
    listeners.get(name)?.forEach((listener) => listener(data));
  const client = new WebTorrentClient({
    wsClient,
    infoHash: INFO_HASH,
    peerId: "-PM0500-llllllllllll",
    offersCount: () => 5,
    shouldGenerateOffers,
  });
  client.start();
  /** A tracker message for this swarm; an undefined field is left out. */
  const message = (fields: Record<string, unknown>) =>
    emit(
      "message",
      JSON.stringify({ action: "announce", info_hash: INFO_HASH, ...fields }),
    );
  /** The tracker's reply to an announce, with its swarm counts if given. */
  const reply = (complete?: number, incomplete?: number) =>
    message({ interval: 120, complete, incomplete });
  /** A peer's offer, which the tracker relays. */
  const peerOffer = () =>
    message({
      peer_id: "-PM0500-rrrrrrrrrrrr",
      offer_id: "offer-1",
      offer: { type: "offer", sdp: "v=0" },
    });
  const offersPerAnnounce = () =>
    sent
      // The announces that can offer: not the "stopped" one destroy() sends,
      // nor an answer to a peer's offer.
      .filter(
        (message) =>
          message.action === "announce" &&
          message.event !== "stopped" &&
          Array.isArray(message.offers),
      )
      .map((message) => (message.offers as unknown[]).length);
  return {
    client,
    wsClient,
    sent,
    emit,
    message,
    reply,
    peerOffer,
    offersPerAnnounce,
  };
}

describe("WebTorrentClient: offers sized to the swarm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    gathering.delayMs = 0;
    vi.useRealTimers();
  });

  it("asks before it offers, and sends nothing more when alone", async () => {
    // The tracker would drop every offer of a peer alone in the swarm: each
    // was a connection and an ICE gathering for nothing. A peer that joins
    // later offers to this one.
    const alone = counter("alone");
    const { client, reply, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    expect(offersPerAnnounce()).toEqual([0]);

    reply(1, 0);
    await vi.advanceTimersByTimeAsync(5000);

    expect(offersPerAnnounce()).toEqual([0]);
    expect(counter("alone")).toBe(alone + 1);
    client.destroy();
  });

  it("offers after all when a later count finds other peers", async () => {
    // On a shared socket, bittorrent-tracker answers the "stopped" of the
    // client that left this swarm before it answers this client's "started":
    // the first count leaves this peer out, and its one other peer looks
    // like this peer.
    const recounted = counter("alone-recounted");
    const { client, reply, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    reply(1, 0); // the reply to the other client's "stopped"
    reply(2, 0); // the reply to this client's "started"
    await vi.advanceTimersByTimeAsync(0);
    expect(offersPerAnnounce()).toEqual([0, 1]);
    expect(counter("alone-recounted")).toBe(recounted + 1);

    reply(3, 0); // the reply to those offers sends no more
    await vi.advanceTimersByTimeAsync(0);
    expect(offersPerAnnounce()).toEqual([0, 1]);
    client.destroy();
  });

  it("sends nothing more at the peer limit when no count comes", async () => {
    const peerLimit = counter("peer-limit");
    const noCount = counter("no-count");
    const { client, offersPerAnnounce } = startClient(() => false);
    await vi.advanceTimersByTimeAsync(2000);

    expect(offersPerAnnounce()).toEqual([0]);
    expect(counter("peer-limit")).toBe(peerLimit + 1);
    expect(counter("no-count")).toBe(noCount);
    client.destroy();
  });

  it("sends nothing on a later count once at the peer limit", async () => {
    let atLimit = false;
    const { client, reply, offersPerAnnounce } = startClient(() => !atLimit);
    await vi.advanceTimersByTimeAsync(0);
    reply(1, 0);
    atLimit = true; // a peer that offered to this one has connected since
    reply(2, 0);
    await vi.advanceTimersByTimeAsync(0);

    expect(offersPerAnnounce()).toEqual([0]);
    client.destroy();
  });

  it("stops waiting for a later count when a peer offers", async () => {
    // A peer that offered has found this one. tracker.webtorrent.dev replies
    // to the answer with a count that includes it: no reason to offer.
    const recounted = counter("alone-recounted");
    const { client, reply, peerOffer, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    reply(1, 0);
    peerOffer();
    await vi.advanceTimersByTimeAsync(0);
    reply(2, 0); // the reply to the answer
    await vi.advanceTimersByTimeAsync(0);

    expect(offersPerAnnounce()).toEqual([0]);
    expect(counter("alone-recounted")).toBe(recounted);
    client.destroy();
  });

  it("stops waiting for a later count at the next announce", async () => {
    const { client, reply, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    reply(1, 0);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(offersPerAnnounce()).toEqual([0, 1]);

    reply(2, 0); // the periodic announce has offered already
    await vi.advanceTimersByTimeAsync(0);
    expect(offersPerAnnounce()).toEqual([0, 1]);
    client.destroy();
  });

  it("offers once to each other peer the reply counts", async () => {
    const sized = counter("sized");
    const capped = counter("offers-capped");
    const { client, reply, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    reply(3, 0); // this peer and two others
    await vi.advanceTimersByTimeAsync(0);

    expect(offersPerAnnounce()).toEqual([0, 2]);
    expect(counter("sized")).toBe(sized + 1);
    expect(counter("offers-capped")).toBe(capped + 1);
    client.destroy();
  });

  it("echoes the tracker id of the reply in the sized announce", async () => {
    const { client, sent, message, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    message({
      interval: 120,
      complete: 0,
      incomplete: 2,
      "tracker id": "tracker-id-1",
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(offersPerAnnounce()).toEqual([0, 1]);
    expect(sent.at(-1)).toMatchObject({ trackerid: "tracker-id-1" });
    client.destroy();
  });

  it("offers no more than configured in a larger swarm", async () => {
    const { client, reply, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    reply(4, 6);
    await vi.advanceTimersByTimeAsync(0);

    expect(offersPerAnnounce()).toEqual([0, 5]);
    client.destroy();
  });

  it("offers in full when no count comes within 2 s", async () => {
    // A tracker that does not count the swarm, or does not answer.
    const noCount = counter("no-count");
    const { client, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(1999);
    expect(offersPerAnnounce()).toEqual([0]);
    await vi.advanceTimersByTimeAsync(1);

    expect(offersPerAnnounce()).toEqual([0, 5]);
    expect(counter("no-count")).toBe(noCount + 1);
    client.destroy();
  });

  it("offers in full at once when the reply carries no count", async () => {
    // No count will come: waiting the 2 s would only delay the offers.
    const noCount = counter("no-count");
    const { client, reply, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    reply(); // no count
    await vi.advanceTimersByTimeAsync(0);
    expect(offersPerAnnounce()).toEqual([0, 5]);

    await vi.advanceTimersByTimeAsync(2000); // and the timer sends no more
    expect(offersPerAnnounce()).toEqual([0, 5]);
    expect(counter("no-count")).toBe(noCount + 1);
    client.destroy();
  });

  it("takes a negative or fractional count for no count", async () => {
    // A tracker whose counts drifted: the sum says alone, but it is not a
    // count. The full number goes out at once, as for a reply without one.
    const alone = counter("alone");
    const { client, reply, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    reply(2, -1);
    await vi.advanceTimersByTimeAsync(0);
    expect(offersPerAnnounce()).toEqual([0, 5]);
    expect(counter("alone")).toBe(alone);

    // A periodic announce keeps the full number: no valid count came.
    reply(0.5, 1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(offersPerAnnounce()).toEqual([0, 5, 5]);
    client.destroy();
  });

  it("takes no count from a reply without the info hash", async () => {
    // On a shared socket, such a reply can be another swarm's: it waits for
    // a reply that names this swarm, and offers in full after 2 s.
    const { client, message, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    message({
      info_hash: undefined,
      interval: 120,
      complete: 0,
      incomplete: 1,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(offersPerAnnounce()).toEqual([0]);

    await vi.advanceTimersByTimeAsync(2000);
    expect(offersPerAnnounce()).toEqual([0, 5]);
    client.destroy();
  });

  it("does not offer at once on a reply without the info hash and count", async () => {
    const { client, message, reply, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    message({ info_hash: undefined, interval: 120 });
    await vi.advanceTimersByTimeAsync(0);
    expect(offersPerAnnounce()).toEqual([0]);

    reply(3, 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(offersPerAnnounce()).toEqual([0, 2]);
    client.destroy();
  });

  it("sends no offers when the tracker refuses the first announce", async () => {
    // A bittorrent-tracker with an info_hash whitelist refuses the swarm.
    const refused = counter("refused");
    const noCount = counter("no-count");
    const { client, message, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    message({ "failure reason": "info_hash is not allowed" });
    await vi.advanceTimersByTimeAsync(2000);

    expect(offersPerAnnounce()).toEqual([0]);
    expect(counter("refused")).toBe(refused + 1);
    expect(counter("no-count")).toBe(noCount);
    client.destroy();
  });

  it("does not take a failure without the info hash as a refusal", async () => {
    // On a shared socket it can belong to another swarm.
    const refused = counter("refused");
    const { client, message, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    message({ info_hash: undefined, "failure reason": "Invalid request" });
    await vi.advanceTimersByTimeAsync(2000);

    expect(offersPerAnnounce()).toEqual([0, 5]);
    expect(counter("refused")).toBe(refused);
    client.destroy();
  });

  it("does not take a peer's offer for the reply", async () => {
    // A peer's offer is relayed with the same action, and with no count.
    const { client, reply, peerOffer, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    peerOffer();
    await vi.advanceTimersByTimeAsync(0);
    expect(offersPerAnnounce()).toEqual([0]);

    reply(3, 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(offersPerAnnounce()).toEqual([0, 2]);
    client.destroy();
  });

  it("sends at least one offer in each periodic announce", async () => {
    // The count is up to an interval old: a peer that joined since, and whose
    // own offers failed to connect, gets this one.
    const capped = counter("offers-capped");
    const { client, reply, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    reply(1, 0);
    await vi.advanceTimersByTimeAsync(120_000);
    reply(2, 0);
    await vi.advanceTimersByTimeAsync(120_000);

    expect(offersPerAnnounce()).toEqual([0, 1, 1]);
    expect(counter("offers-capped")).toBe(capped + 2);
    client.destroy();
  });

  it("asks again after a lost socket, and forgets the old count", async () => {
    // A new socket may reach a tracker that no longer counts this peer: a
    // reply without a count offers in full, not as the old count said.
    const { client, wsClient, emit, reply, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    reply(3, 0);
    await vi.advanceTimersByTimeAsync(0);
    wsClient.state = "reconnecting";
    emit("disconnected");
    wsClient.state = "connected";
    emit("connected");
    await vi.advanceTimersByTimeAsync(0);
    expect(offersPerAnnounce()).toEqual([0, 2, 0]);

    reply(); // no count
    await vi.advanceTimersByTimeAsync(0);
    expect(offersPerAnnounce()).toEqual([0, 2, 0, 5]);
    client.destroy();
  });

  it("leaves the old wait to the old socket when the socket is back within 2 s", async () => {
    // The old socket's wait would end at 2 s and offer in full on the new
    // socket, before the new socket's count.
    const noCount = counter("no-count");
    const { client, wsClient, emit, reply, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(1000);
    wsClient.state = "reconnecting";
    emit("disconnected");
    wsClient.state = "connected";
    emit("connected");
    await vi.advanceTimersByTimeAsync(1500); // past the old socket's 2 s
    expect(offersPerAnnounce()).toEqual([0, 0]);
    expect(counter("no-count")).toBe(noCount);

    reply(1, 0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(offersPerAnnounce()).toEqual([0, 0]);
    client.destroy();
  });

  it("stops waiting for the count while the socket is lost", async () => {
    const noCount = counter("no-count");
    const { client, wsClient, emit, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    wsClient.state = "reconnecting";
    emit("disconnected");
    await vi.advanceTimersByTimeAsync(3000);

    expect(counter("no-count")).toBe(noCount);
    expect(offersPerAnnounce()).toEqual([0]);
    client.destroy();
  });

  it("drops the offers of an announce the lost socket interrupted", async () => {
    // The socket comes back while a periodic announce still gathers its
    // offers: they were sized for the old socket, and must not go out on the
    // new one before its count.
    const socketLost = counter("socket-lost");
    const { client, emit, reply, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    reply(6, 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(offersPerAnnounce()).toEqual([0, 5]);

    gathering.delayMs = 3000;
    await vi.advanceTimersByTimeAsync(120_000); // the periodic announce starts
    emit("disconnected");
    emit("connected");
    await vi.advanceTimersByTimeAsync(0);
    expect(offersPerAnnounce()).toEqual([0, 5, 0]);

    // Its connections are closed, not left open for the offer timeout.
    const closed = connections.closed;
    reply(1, 0);
    await vi.advanceTimersByTimeAsync(5000); // its offers are gathered
    expect(offersPerAnnounce()).toEqual([0, 5, 0]);
    expect(connections.closed - closed).toBe(5);
    expect(counter("socket-lost")).toBe(socketLost + 1);
    client.destroy();
  });

  it("counts no capped announce that a lost socket dropped", async () => {
    const { client, emit, reply, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    reply(3, 0); // two other peers: capped to 2 of 5
    await vi.advanceTimersByTimeAsync(0);
    const capped = counter("offers-capped");

    gathering.delayMs = 3000;
    await vi.advanceTimersByTimeAsync(120_000); // a capped periodic announce
    emit("disconnected");
    emit("connected");
    await vi.advanceTimersByTimeAsync(0);
    reply(1, 0);
    await vi.advanceTimersByTimeAsync(5000); // it is dropped

    expect(offersPerAnnounce()).toEqual([0, 2, 0]);
    expect(counter("offers-capped")).toBe(capped);
    client.destroy();
  });

  it("sends the new socket's offers although an old announce still gathers", async () => {
    // The sized announce of the new socket must not join the old announce,
    // which is dropped: its offers would then wait for the next interval.
    const { client, emit, reply, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    reply(6, 0);
    await vi.advanceTimersByTimeAsync(0);

    gathering.delayMs = 3000;
    await vi.advanceTimersByTimeAsync(120_000); // the periodic announce starts
    emit("disconnected");
    emit("connected");
    await vi.advanceTimersByTimeAsync(0);
    reply(3, 0); // the new socket's count: two other peers
    await vi.advanceTimersByTimeAsync(5000);

    expect(offersPerAnnounce()).toEqual([0, 5, 0, 2]);
    client.destroy();
  });

  it("sends nothing more at the peer limit, whatever the count", async () => {
    // A second announce would carry no offers: it would only repeat the
    // first, and count as sized.
    const peerLimit = counter("peer-limit");
    const sized = counter("sized");
    const { client, reply, offersPerAnnounce } = startClient(() => false);
    await vi.advanceTimersByTimeAsync(0);
    reply(3, 0);
    await vi.advanceTimersByTimeAsync(0);

    expect(offersPerAnnounce()).toEqual([0]);
    expect(counter("peer-limit")).toBe(peerLimit + 1);
    expect(counter("sized")).toBe(sized);
    client.destroy();
  });

  it("records nothing when the socket is disposed while it waits for the count", async () => {
    // The pool disposes a socket a loader failed to release: no
    // "disconnected" comes, and no announce can go out.
    const noCount = counter("no-count");
    const { client, wsClient, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    wsClient.state = "disposed";
    await vi.advanceTimersByTimeAsync(2000);

    expect(counter("no-count")).toBe(noCount);
    expect(offersPerAnnounce()).toEqual([0]);
    client.destroy();
  });

  it("drops the offers of an announce whose socket is disposed", async () => {
    // No "disconnected" comes: the announce must not go out on the socket,
    // and its connections are closed.
    const socketLost = counter("socket-lost");
    const { client, wsClient, reply, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    gathering.delayMs = 3000;
    reply(3, 0); // the sized announce starts to gather 2 offers
    await vi.advanceTimersByTimeAsync(0);
    wsClient.state = "disposed";
    const closed = connections.closed;
    await vi.advanceTimersByTimeAsync(3000);

    expect(offersPerAnnounce()).toEqual([0]);
    expect(connections.closed - closed).toBe(2);
    expect(counter("socket-lost")).toBe(socketLost);
    client.destroy();
  });

  it("leaves no timer behind when destroyed while it waits for the count", async () => {
    compiledLedger?.clearAnomalies();
    const { client, offersPerAnnounce } = startClient();
    await vi.advanceTimersByTimeAsync(0);
    client.destroy();
    await vi.advanceTimersByTimeAsync(5000);

    expect(offersPerAnnounce()).toEqual([0]);
    expect(compiledLedger?.snapshot()?.anomalies ?? []).toEqual([]);
  });
});
