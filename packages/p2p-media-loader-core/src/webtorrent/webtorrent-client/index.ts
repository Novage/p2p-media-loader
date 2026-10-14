import { diagnostics, type DiagnosticsToken } from "../../diagnostics.js";
import debug from "debug";
import { EventTarget } from "../../utils/event-target.js";
import { getPromiseWithResolvers } from "../../utils/utils.js";
import { isTerminalConnectionState } from "../utils.js";
import { WebSocketClient } from "../websocket-client/index.js";
import { TrackerError, TrackerWarning, PeerConnectError } from "../../types.js";
import { SafeAbortController } from "../../utils/abort-controller.js";

import {
  PeerConnection,
  SessionDescription,
  safeCreateOffer,
  safeCreateAnswer,
  safeSetLocalDescription,
  safeSetRemoteDescription,
} from "./webrtc-utils.js";

/**
 * One signaling exchange with a remote peer, as the client puts it to
 * `claimPeer`: which side of it this peer is, and how to give it up. The
 * same object comes back with the exchange's `peerConnected` or
 * `peerConnectFailed`, so a claimant can tell which exchange ended.
 */
export type PeerHandshake = {
  /** `offerer`: the peer answered our offer. `answerer`: we answer theirs. */
  readonly role: "offerer" | "answerer";
  /** Abandons the exchange; it then ends with `peerConnectFailed`. */
  readonly cancel: () => void;
};

type HandshakeSignal = InstanceType<typeof SafeAbortController>["signal"];

function throwIfAborted(signal: HandshakeSignal): void {
  if (signal.aborted) throw new Error("Handshake abandoned");
}

export type WebTorrentClientEventMap = {
  peerConnected: (event: {
    peerId: string;
    connection: RTCPeerConnection;
    channel: RTCDataChannel;
    handshake: PeerHandshake;
  }) => void;
  peerConnectFailed: (event: {
    peerId: string;
    error: PeerConnectError;
    handshake: PeerHandshake;
  }) => void;
  warning: (warning: TrackerWarning) => void;
  error: (error: TrackerError) => void;
};

const WEBTORRENT_DEFAULT_OFFER_TIMEOUT = 50000;
const WEBTORRENT_DEFAULT_CONNECTION_TIMEOUT = 15000;
const WEBTORRENT_DEFAULT_OFFERS_COUNT = 5;
/**
 * How long the first announce, which carries no offers, waits for a reply that
 * counts the swarm before the full number of offers goes out anyway.
 */
const FIRST_COUNT_WAIT_MS = 2000;
const WEBTORRENT_DEFAULT_ICE_GATHERING_TIMEOUT = 5000;

/**
 * Added to the answerer's wait for the data channel. The answerer starts to
 * wait when it sends its answer, and the tracker must then deliver that answer
 * to the offerer. The offerer starts to wait when the answer arrives. Without
 * this allowance, a slow tracker makes the answerer give up first, while the
 * connection is still forming.
 */
const ANSWER_RELAY_ALLOWANCE_MS = 5000;

/**
 * Bytes this peer has moved in one swarm since it joined it: what it
 * downloaded, over HTTP and P2P together, and what it uploaded to peers. Sent
 * as the announce's `uploaded` and `downloaded`, so that a tracker can count a
 * swarm's P2P bytes (the sum of `uploaded`) against all of its bytes (the sum
 * of `downloaded`).
 */
export type TransferredBytes = { uploaded: number; downloaded: number };

const NOTHING_TRANSFERRED: TransferredBytes = { uploaded: 0, downloaded: 0 };

export interface WebTorrentClientConfig {
  wsClient: WebSocketClient;
  infoHash: string;
  peerId: string;
  rtcConfig?: () => RTCConfiguration | undefined;
  channelConfig?: RTCDataChannelInit;
  offerTimeout?: () => number;
  offersCount?: () => number;
  iceGatheringTimeout?: () => number;
  connectionTimeout?: () => number;
  claimPeer?: (peerId: string, handshake: PeerHandshake) => boolean;
  shouldGenerateOffers?: () => boolean;
  transferredBytes?: () => TransferredBytes;
}

type PendingOffer = {
  connection: RTCPeerConnection;
  channel: RTCDataChannel;
  timeoutId: ReturnType<typeof setTimeout>;
};

type IncomingOffer = {
  sdp: RTCSessionDescriptionInit;
  peerId: string;
  offerId: string;
};

type IncomingAnswer = {
  sdp: RTCSessionDescriptionInit;
  peerId: string;
  offerId: string;
};

function generateOfferId(): string {
  // Generate a safe 20-character alphanumeric string
  let id = "";
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 20; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

const VALID_SDP_TYPES = new Set(["offer", "answer", "pranswer", "rollback"]);

function isSessionDescriptionInit(
  value: unknown,
): value is RTCSessionDescriptionInit {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.type === "string" &&
    VALID_SDP_TYPES.has(obj.type) &&
    typeof obj.sdp === "string"
  );
}

export class WebTorrentClient {
  static readonly #DEFAULT_ANNOUNCE_INTERVAL_SECONDS = 120;
  static readonly #MIN_ANNOUNCE_INTERVAL_SECONDS = 20;

  readonly #config: Required<
    Omit<WebTorrentClientConfig, "rtcConfig" | "channelConfig" | "wsClient">
  > & {
    rtcConfig?: () => RTCConfiguration | undefined;
    channelConfig?: RTCDataChannelInit;
  };

  readonly #wsClient: WebSocketClient;
  readonly #eventTarget = new EventTarget<WebTorrentClientEventMap>();
  readonly #pendingOffers = new Map<string, PendingOffer>();
  readonly #negotiatingConnections = new Set<RTCPeerConnection>();
  readonly #destroyAbortController = new SafeAbortController();

  #announceTimeoutId: ReturnType<typeof setTimeout> | null = null;
  #announceIntervalSeconds: number | null = null;
  #scheduleAnnounceRunId = 0;
  #activeAnnouncePromise: Promise<void> | null = null;
  /** Counts the lost sockets: an announce of an earlier socket is stale. */
  #socketLossCount = 0;
  #trackerId: string | null = null;
  /**
   * The peers of the swarm, this one included, as the tracker's last announce
   * reply counted them (`complete` + `incomplete`); `null` until a reply has.
   */
  #swarmSize: number | null = null;
  /** While the first announce of a connection waits for the swarm's count. */
  #firstCountTimeoutId: ReturnType<typeof setTimeout> | null = null;
  /**
   * The first count found this peer alone, and no announce has gone out
   * since. That count may not be the reply to this client's own announce. On
   * a shared socket, a tracker can first answer the "stopped" of a client
   * that left this swarm. That count does not include this peer. A later
   * reply that counts other peers sends the offers after all, unless a peer
   * has offered to this one since.
   */
  #aloneByFirstCount = false;
  #started = false;
  /**
   * Signaling is where a peer that dropped either finds its way back into the
   * swarm or silently fails to: an announce that carried no offers, an offer
   * the manager refused, an answer for an offer that had already expired. None
   * of it shows anywhere else, so each step logs. Enable with
   * localStorage.debug = "p2pml-core:tracker".
   */
  readonly #logger = debug("p2pml-core:tracker");

  /** The swarm and peer this client speaks for, short enough to read. */
  get #who(): string {
    return `${this.#config.infoHash.slice(0, 8)}/${this.#config.peerId.slice(-6)}`;
  }

  #isDestroyed(): boolean {
    return this.#destroyAbortController.signal.aborted;
  }

  #throwIfDestroyed(): void {
    if (this.#destroyAbortController.signal.aborted) {
      throw new Error("Client destroyed");
    }
  }

  constructor(config: WebTorrentClientConfig) {
    this.#config = {
      infoHash: config.infoHash,
      peerId: config.peerId,
      rtcConfig: config.rtcConfig,
      channelConfig: config.channelConfig,
      offerTimeout:
        config.offerTimeout ?? (() => WEBTORRENT_DEFAULT_OFFER_TIMEOUT),
      offersCount:
        config.offersCount ?? (() => WEBTORRENT_DEFAULT_OFFERS_COUNT),
      iceGatheringTimeout:
        config.iceGatheringTimeout ??
        (() => WEBTORRENT_DEFAULT_ICE_GATHERING_TIMEOUT),
      connectionTimeout:
        config.connectionTimeout ??
        (() => WEBTORRENT_DEFAULT_CONNECTION_TIMEOUT),
      claimPeer: config.claimPeer ?? (() => true),
      shouldGenerateOffers: config.shouldGenerateOffers ?? (() => true),
      transferredBytes: config.transferredBytes ?? (() => NOTHING_TRANSFERRED),
    };

    this.#wsClient = config.wsClient;
  }

  public addEventListener<K extends keyof WebTorrentClientEventMap>(
    eventName: K,
    listener: WebTorrentClientEventMap[K],
  ): void {
    this.#eventTarget.addEventListener(eventName, listener);
  }

  public removeEventListener<K extends keyof WebTorrentClientEventMap>(
    eventName: K,
    listener: WebTorrentClientEventMap[K],
  ): void {
    this.#eventTarget.removeEventListener(eventName, listener);
  }

  #diagnosticsToken?: DiagnosticsToken;

  public start(): void {
    if (this.#isDestroyed() || this.#started) return;
    this.#started = true;
    this.#diagnosticsToken = diagnostics?.open("TrackerClient");

    this.#wsClient.addEventListener("connected", this.#onWsConnected);
    this.#wsClient.addEventListener("disconnected", this.#onWsDisconnected);
    this.#wsClient.addEventListener("message", this.#onWsMessage);

    if (this.#wsClient.state === "connected") {
      this.#onWsConnected();
    }
  }

  public destroy(): void {
    if (this.#isDestroyed()) return;
    // Opened by `start()`: a client destroyed before it started holds none.
    if (this.#diagnosticsToken) {
      diagnostics?.close(this.#diagnosticsToken, "destroyed");
    }
    this.#destroyAbortController.abort();
    this.#clearAnnounceTimeout();
    this.#clearFirstCountTimeout();

    this.#sendStopped();

    this.#cleanupPendingOffers();
    this.#cleanupNegotiatingConnections();

    if (this.#started) {
      this.#wsClient.removeEventListener("connected", this.#onWsConnected);
      this.#wsClient.removeEventListener(
        "disconnected",
        this.#onWsDisconnected,
      );
      this.#wsClient.removeEventListener("message", this.#onWsMessage);
    }

    this.#eventTarget.clear();
  }

  #onWsConnected = (): void => {
    this.#logger(`${this.#who} tracker socket connected`);
    // Setup a fallback interval in case the tracker doesn't provide one
    this.#scheduleAnnounce(WebTorrentClient.#DEFAULT_ANNOUNCE_INTERVAL_SECONDS);

    // The first announce asks before it offers: it carries no offers, and the
    // count in its reply sizes the next one (#sendFirstOffers). A peer alone
    // in the swarm then sends none: a peer that joins later offers to it.
    // A tracker that sends no count gets the full number all the same.
    this.#clearFirstCountTimeout();
    this.#firstCountTimeoutId = setTimeout(() => {
      if (this.#isDestroyed()) {
        diagnostics?.anomaly("TrackerClient first-count timer after destroy");
      }
      this.#sendFirstOffers();
    }, FIRST_COUNT_WAIT_MS);
    this.#sendStarted();
  };

  /**
   * Sends the offers of a new connection, once the swarm is counted or the
   * wait for a count is over (`#swarmSize` still null), unless the peer is
   * alone or at its peer limit. `#announce` sizes them from `#swarmSize`.
   */
  #sendFirstOffers(): void {
    this.#clearFirstCountTimeout();
    if (this.#isDestroyed()) return;
    // A socket disposed under a live client sends no "disconnected", so the
    // timer can still fire. No announce can go out: nothing to record.
    if (this.#wsClient.state !== "connected") return;
    if (!this.#config.shouldGenerateOffers()) {
      // Its offers would all be empty: the announce would only repeat the
      // "started" one. Its next periodic announce offers if it is below its
      // limit by then.
      diagnostics?.count("TrackerAnnounce:peer-limit");
      this.#logger(`${this.#who} at the peer limit; no offers`);
      return;
    }
    const counted = this.#swarmSize;
    if (counted !== null && counted <= 1) {
      diagnostics?.count("TrackerAnnounce:alone");
      this.#logger(`${this.#who} alone in the swarm; no offers`);
      this.#aloneByFirstCount = true;
      return;
    }
    if (counted === null) {
      diagnostics?.count("TrackerAnnounce:no-count");
      this.#logger(
        `${this.#who} no swarm count from the tracker; offering in full`,
      );
    } else {
      diagnostics?.count("TrackerAnnounce:sized");
    }
    this.#announceOrReport();
  }

  #announceOrReport(): void {
    this.#announce().catch((err: unknown) => {
      this.#reportAnnounceFailure("Announce failed", err);
    });
  }

  #reportAnnounceFailure(failure: string, err: unknown): void {
    if (this.#isDestroyed()) return;
    this.#eventTarget.dispatchEvent(
      "error",
      new TrackerError(
        "announce-failed",
        `${failure}: ${err instanceof Error ? err.message : String(err)}`,
        err,
      ),
    );
  }

  #clearFirstCountTimeout(): void {
    if (this.#firstCountTimeoutId === null) return;
    clearTimeout(this.#firstCountTimeoutId);
    this.#firstCountTimeoutId = null;
  }

  #onWsDisconnected = (): void => {
    this.#logger(
      `${this.#who} tracker socket lost; announces stop until it is back`,
    );
    this.#clearAnnounceTimeout();
    this.#clearFirstCountTimeout();
    this.#announceIntervalSeconds = null;
    // A new socket may reach a tracker that no longer counts this peer.
    this.#swarmSize = null;
    // An announce still gathering its offers must not be the one the next
    // socket joins: it would go out before that socket's count, with offers
    // it was not sized for. It drops them instead.
    this.#socketLossCount++;
    this.#activeAnnouncePromise = null;
    this.#aloneByFirstCount = false;
  };

  #onWsMessage = (data: ArrayBuffer | string): void => {
    if (this.#isDestroyed()) return;

    let msg: unknown;

    try {
      const text =
        typeof data === "string" ? data : new TextDecoder().decode(data);
      msg = JSON.parse(text) as unknown;
    } catch (err: unknown) {
      this.#eventTarget.dispatchEvent(
        "error",
        new TrackerError(
          "parse-error",
          `Failed to parse tracker message: ${err instanceof Error ? err.message : String(err)}`,
          err,
        ),
      );
      return;
    }

    if (typeof msg !== "object" || msg === null || Array.isArray(msg)) return;
    const dataObject = msg as Record<string, unknown>;

    // Ignore messages for a different torrent (possible on shared WebSocket connections)
    const infoHash = dataObject.info_hash;
    if (typeof infoHash === "string" && infoHash !== this.#config.infoHash) {
      return;
    }

    const warningMessage = dataObject["warning message"];
    if (typeof warningMessage === "string") {
      this.#eventTarget.dispatchEvent(
        "warning",
        new TrackerWarning("tracker-response", warningMessage),
      );
    }

    const failureReason = dataObject["failure reason"];
    if (typeof failureReason === "string") {
      this.#eventTarget.dispatchEvent(
        "error",
        new TrackerError("tracker-response", failureReason),
      );
      return;
    }

    const { interval } = dataObject;
    if (typeof interval === "number" && interval > 0) {
      // Defend against trackers asking for extremely frequent announces
      const safeInterval = Math.max(
        WebTorrentClient.#MIN_ANNOUNCE_INTERVAL_SECONDS,
        interval,
      );
      if (this.#announceIntervalSeconds !== safeInterval) {
        this.#logger(
          `${this.#who} tracker asks for an announce every ${safeInterval}s; nothing re-announces sooner, so a lost peer waits up to that long`,
        );
        this.#scheduleAnnounce(safeInterval);
      }
    }

    // The WebTorrent tracker protocol specifies "tracker id" (with a space) in the
    // response, but expects it to be echoed back as "trackerid" (no space) in
    // subsequent announce requests. We store it here and send it back later.
    // Stored before the count, which can start an announce.
    const trackerId = dataObject["tracker id"];
    if (typeof trackerId === "string") {
      this.#trackerId = trackerId;
    }

    // A count decides whether this client offers at all, so it is taken only
    // from a reply that names this swarm. A message without `info_hash`
    // reaches every client on a shared socket. A tracker that leaves it out
    // gets the full number of offers after the wait.
    if (infoHash === this.#config.infoHash) {
      const { complete, incomplete } = dataObject;
      if (typeof complete === "number" && typeof incomplete === "number") {
        this.#swarmSize = complete + incomplete;
        if (this.#firstCountTimeoutId !== null) {
          this.#sendFirstOffers();
        } else if (this.#aloneByFirstCount && this.#swarmSize > 1) {
          this.#aloneByFirstCount = false;
          diagnostics?.count("TrackerAnnounce:alone-recounted");
          if (this.#config.shouldGenerateOffers()) {
            this.#logger(
              `${this.#who} a later count finds other peers; offering after all`,
            );
            this.#announceOrReport();
          } else {
            this.#logger(
              `${this.#who} a later count finds other peers; no offers at the peer limit`,
            );
          }
        }
      } else if (
        this.#firstCountTimeoutId !== null &&
        dataObject.action === "announce" &&
        dataObject.offer === undefined &&
        dataObject.answer === undefined
      ) {
        // The reply to the announce, and no count in it: none will come, so
        // the wait would only delay the offers.
        this.#sendFirstOffers();
      }
    }

    // Ignore offers/answers from ourselves
    const peerId = dataObject.peer_id;
    if (typeof peerId === "string" && peerId === this.#config.peerId) {
      return;
    }

    // Both offer and answer messages require peer_id and offer_id
    const offerId = dataObject.offer_id;
    if (typeof peerId !== "string" || typeof offerId !== "string") return;

    if (isSessionDescriptionInit(dataObject.offer)) {
      this.#handleIncomingOffer({
        sdp: dataObject.offer,
        peerId,
        offerId,
      }).catch((err: unknown) => {
        if (this.#isDestroyed()) return;
        this.#eventTarget.dispatchEvent(
          "error",
          new TrackerError(
            "signaling-failed",
            `Failed to handle offer: ${err instanceof Error ? err.message : String(err)}`,
            err,
          ),
        );
      });
    } else if (isSessionDescriptionInit(dataObject.answer)) {
      this.#handleIncomingAnswer({
        sdp: dataObject.answer,
        peerId,
        offerId,
      }).catch((err: unknown) => {
        if (this.#isDestroyed()) return;
        this.#eventTarget.dispatchEvent(
          "error",
          new TrackerError(
            "signaling-failed",
            `Failed to handle answer: ${err instanceof Error ? err.message : String(err)}`,
            err,
          ),
        );
      });
    }
  };

  #scheduleAnnounce(intervalSeconds: number): void {
    this.#clearAnnounceTimeout();
    this.#announceIntervalSeconds = intervalSeconds;

    const runId = ++this.#scheduleAnnounceRunId;

    const run = async () => {
      // `destroy()` clears this timer; a run after it is one it missed.
      if (this.#isDestroyed()) {
        diagnostics?.anomaly("TrackerClient announce timer after destroy");
      }
      try {
        await this.#announce();
      } catch (err: unknown) {
        this.#reportAnnounceFailure("Announce failed", err);
      }

      if (
        !this.#isDestroyed() &&
        this.#announceIntervalSeconds !== null &&
        this.#scheduleAnnounceRunId === runId
      ) {
        this.#announceTimeoutId = setTimeout(
          run,
          this.#announceIntervalSeconds * 1000,
        );
      }
    };

    this.#announceTimeoutId = setTimeout(run, intervalSeconds * 1000);
  }

  #clearAnnounceTimeout(): void {
    if (this.#announceTimeoutId !== null) {
      clearTimeout(this.#announceTimeoutId);
      this.#announceTimeoutId = null;
    }
  }

  async #announce(): Promise<void> {
    if (this.#isDestroyed() || this.#wsClient.state !== "connected") return;

    // An announce ends the wait for a later count: it sends its own offers,
    // and the replies that follow answer it.
    this.#aloneByFirstCount = false;

    if (this.#activeAnnouncePromise) {
      return this.#activeAnnouncePromise;
    }

    const socketLossCount = this.#socketLossCount;
    const promise = (async () => {
      const shouldGenerateOffers = this.#config.shouldGenerateOffers();
      const configuredCount = shouldGenerateOffers
        ? this.#config.offersCount()
        : 0;
      // The tracker gives each offer to a different peer of the swarm and
      // drops the rest. An offer past the other peers it counted only costs a
      // connection and its ICE gathering. The tracker chooses the receivers,
      // so peers already connected count too. A periodic announce reads a
      // count up to an interval old, so it sends at least one offer. That
      // offer reaches a peer that joined since, if the offers of that peer
      // failed to connect. The announce after the first is sent only when the
      // count found other peers, so the floor of one does not change it.
      const offersCount =
        this.#swarmSize === null
          ? configuredCount
          : Math.min(configuredCount, Math.max(this.#swarmSize - 1, 1));
      if (offersCount < configuredCount) {
        diagnostics?.count("TrackerAnnounce:offers-capped");
      }
      if (!shouldGenerateOffers) {
        // A peer at its own peer limit announces to keep its place in the
        // swarm and can only be dialled, never dial: it will not reconnect to
        // anyone by itself.
        this.#logger(
          `${this.#who} announce with no offers: the peer limit is reached, so this peer can only accept`,
        );
      }

      // Generate offers in parallel to avoid sequential ICE gathering latency.
      // Each #createOffer() internally catches its own errors and returns
      // undefined on failure, so Promise.all() will never reject here.
      // We avoid Promise.allSettled() for older browser compatibility.
      const results = await Promise.all(
        Array.from({ length: offersCount }, () => this.#createOffer()),
      );

      // A socket disposed under a live client sends no "disconnected": its
      // announce is dropped too, with nothing to record.
      const socketLost = socketLossCount !== this.#socketLossCount;
      if (
        this.#isDestroyed() ||
        socketLost ||
        this.#wsClient.state !== "connected"
      ) {
        for (const result of results) {
          if (result) {
            this.#cleanupPendingOffer(result.offer_id);
          }
        }
        if (socketLost && !this.#isDestroyed()) {
          diagnostics?.count("TrackerAnnounce:socket-lost");
          this.#logger(
            `${this.#who} announce dropped: the socket was lost while it gathered ${offersCount} offers`,
          );
        }
        return;
      }

      const offers: {
        offer: { type: string; sdp: string };
        offer_id: string;
      }[] = [];

      for (const result of results) {
        if (result) {
          offers.push(result);
        }
      }

      const payload = this.#buildAnnouncePayload({
        numwant: offers.length,
        offers,
      });

      this.#logger(
        `${this.#who} announce with ${offers.length} of ${offersCount} offers`,
      );

      try {
        this.#wsClient.send(JSON.stringify(payload));
      } catch (err: unknown) {
        for (const offer of offers) {
          this.#cleanupPendingOffer(offer.offer_id);
        }
        throw err;
      }
    })();

    this.#activeAnnouncePromise = promise;

    try {
      await promise;
    } finally {
      if (this.#activeAnnouncePromise === promise) {
        this.#activeAnnouncePromise = null;
      }
    }
  }

  async #createOffer(): Promise<
    | {
        offer: { type: string; sdp: string };
        offer_id: string;
      }
    | undefined
  > {
    if (this.#isDestroyed()) return undefined;

    let pc: RTCPeerConnection | undefined;
    try {
      pc = new PeerConnection(this.#config.rtcConfig?.());
      this.#negotiatingConnections.add(pc);

      const channel = pc.createDataChannel(
        "webtorrent",
        this.#config.channelConfig,
      );

      const offer = await safeCreateOffer(pc);
      this.#throwIfDestroyed();

      await safeSetLocalDescription(pc, offer);
      this.#throwIfDestroyed();

      await this.#waitForIceGathering(pc);
      this.#throwIfDestroyed();

      const sdp = pc.localDescription;
      if (!sdp?.sdp) {
        pc.close();
        return undefined;
      }

      const offerId = generateOfferId();

      this.#pendingOffers.set(offerId, {
        connection: pc,
        channel,
        timeoutId: setTimeout(() => {
          this.#cleanupPendingOffer(offerId);
        }, this.#config.offerTimeout()),
      });

      return {
        offer: { type: sdp.type, sdp: sdp.sdp },
        offer_id: offerId,
      };
    } catch (err: unknown) {
      pc?.close();
      if (!this.#isDestroyed()) {
        this.#eventTarget.dispatchEvent(
          "warning",
          new TrackerWarning(
            "offer-failed",
            `Failed to create offer: ${err instanceof Error ? err.message : String(err)}`,
            err,
          ),
        );
      }
    } finally {
      if (pc) {
        this.#negotiatingConnections.delete(pc);
      }
    }

    return undefined;
  }

  /**
   * The first announce of a connection. It carries no offers: the count in
   * its reply sizes the next one (#sendFirstOffers).
   */
  #sendStarted(): void {
    if (this.#isDestroyed() || this.#wsClient.state !== "connected") return;

    const payload = this.#buildAnnouncePayload({
      numwant: 0,
      offers: [],
      event: "started",
    });

    this.#logger(`${this.#who} announce "started" with no offers`);

    try {
      this.#wsClient.send(JSON.stringify(payload));
    } catch (err: unknown) {
      this.#reportAnnounceFailure("Initial announce failed", err);
    }
  }

  #sendStopped(): void {
    if (this.#wsClient.state !== "connected") return;

    const payload = this.#buildAnnouncePayload({
      numwant: 0,
      offers: [],
      event: "stopped",
    });

    try {
      this.#wsClient.send(JSON.stringify(payload));
    } catch {
      // Best-effort "stopped" notification
    }
  }

  #buildAnnouncePayload({
    numwant,
    offers,
    event,
  }: {
    numwant: number;
    offers: { offer: { type: string; sdp: string }; offer_id: string }[];
    event?: string;
  }): Record<string, unknown> {
    const { uploaded, downloaded } = this.#config.transferredBytes();
    const payload: Record<string, unknown> = {
      action: "announce",
      info_hash: this.#config.infoHash,
      peer_id: this.#config.peerId,
      numwant,
      uploaded,
      downloaded,
      offers,
    };

    if (event) {
      payload.event = event;
    }

    if (this.#trackerId) {
      payload.trackerid = this.#trackerId;
    }

    return payload;
  }

  async #handleIncomingOffer({
    sdp: offerSdp,
    peerId: remotePeerId,
    offerId: remoteOfferId,
  }: IncomingOffer): Promise<void> {
    if (this.#isDestroyed()) return;

    // A peer of the swarm has found this one, so a later count above one is
    // no sign of a wrong alone count. Some trackers also reply to the answer
    // with a count, and that count includes the offerer.
    this.#aloneByFirstCount = false;

    const { handshake, signal, end } = this.#startHandshake("answerer");
    if (!this.#config.claimPeer(remotePeerId, handshake)) {
      end();
      this.#logger(
        `${this.#who} refused an offer from ${remotePeerId.slice(-6)}: the manager already holds that peer id`,
      );
      return;
    }

    this.#logger(
      `${this.#who} answering an offer from ${remotePeerId.slice(-6)}`,
    );

    let pc: RTCPeerConnection | undefined;
    try {
      pc = new PeerConnection(this.#config.rtcConfig?.());
      this.#negotiatingConnections.add(pc);

      await safeSetRemoteDescription(pc, new SessionDescription(offerSdp));
      throwIfAborted(signal);

      const answer = await safeCreateAnswer(pc);
      throwIfAborted(signal);

      await safeSetLocalDescription(pc, answer);
      throwIfAborted(signal);

      await this.#waitForIceGathering(pc, signal);
      throwIfAborted(signal);

      const sdp = pc.localDescription;
      if (!sdp) {
        throw new Error("Failed to get local description after ICE gathering");
      }

      const payload = {
        action: "announce",
        info_hash: this.#config.infoHash,
        peer_id: this.#config.peerId,
        to_peer_id: remotePeerId,
        offer_id: remoteOfferId,
        answer: { type: sdp.type, sdp: sdp.sdp },
      };

      this.#wsClient.send(JSON.stringify(payload));

      const channel = await this.#waitForConnection(
        pc,
        undefined,
        signal,
        this.#config.connectionTimeout() + ANSWER_RELAY_ALLOWANCE_MS,
      );
      throwIfAborted(signal);

      this.#logger(`${this.#who} connected to ${remotePeerId.slice(-6)}`);
      this.#eventTarget.dispatchEvent("peerConnected", {
        peerId: remotePeerId,
        connection: pc,
        channel,
        handshake,
      });
    } catch (err: unknown) {
      pc?.close();
      this.#onHandshakeFailed(remotePeerId, handshake, signal, err);
    } finally {
      end();
      if (pc) this.#negotiatingConnections.delete(pc);
    }
  }

  async #handleIncomingAnswer({
    sdp: answerSdp,
    peerId: remotePeerId,
    offerId: ourOfferId,
  }: IncomingAnswer): Promise<void> {
    if (this.#isDestroyed()) return;

    const pending = this.#pendingOffers.get(ourOfferId);
    if (!pending) {
      this.#logger(
        `${this.#who} dropped an answer from ${remotePeerId.slice(-6)}: offer ${ourOfferId.slice(-6)} had already expired or was never ours`,
      );
      return;
    }

    // Stop tracking it as pending
    this.#pendingOffers.delete(ourOfferId);
    clearTimeout(pending.timeoutId);

    const { handshake, signal, end } = this.#startHandshake("offerer");
    if (!this.#config.claimPeer(remotePeerId, handshake)) {
      end();
      this.#logger(
        `${this.#who} refused an answer from ${remotePeerId.slice(-6)}: the manager already holds that peer id`,
      );
      pending.connection.close();
      return;
    }

    this.#negotiatingConnections.add(pending.connection);

    try {
      await safeSetRemoteDescription(
        pending.connection,
        new SessionDescription(answerSdp),
      );
      throwIfAborted(signal);

      const channel = await this.#waitForConnection(
        pending.connection,
        pending.channel,
        signal,
        this.#config.connectionTimeout(),
      );
      throwIfAborted(signal);

      this.#logger(`${this.#who} connected to ${remotePeerId.slice(-6)}`);
      this.#eventTarget.dispatchEvent("peerConnected", {
        peerId: remotePeerId,
        connection: pending.connection,
        channel,
        handshake,
      });
    } catch (err: unknown) {
      pending.connection.close();
      this.#onHandshakeFailed(remotePeerId, handshake, signal, err);
    } finally {
      end();
      this.#negotiatingConnections.delete(pending.connection);
    }
  }

  /**
   * A handshake with a remote peer, as `claimPeer` is told of it, and the
   * signal that ends it: when its claimant cancels it, or when this client is
   * destroyed. `end` detaches it from the client once it is over.
   */
  #startHandshake(role: PeerHandshake["role"]): {
    handshake: PeerHandshake;
    signal: HandshakeSignal;
    end: () => void;
  } {
    const controller = new SafeAbortController();
    const destroySignal = this.#destroyAbortController.signal;
    const abort = () => controller.abort();
    if (destroySignal.aborted) abort();
    else destroySignal.addEventListener("abort", abort);
    return {
      handshake: { role, cancel: abort },
      signal: controller.signal,
      end: () => destroySignal.removeEventListener("abort", abort),
    };
  }

  #onHandshakeFailed(
    remotePeerId: string,
    handshake: PeerHandshake,
    signal: HandshakeSignal,
    err: unknown,
  ): void {
    const message = err instanceof Error ? err.message : String(err);
    this.#logger(
      signal.aborted && !this.#isDestroyed()
        ? `${this.#who} gave up the handshake with ${remotePeerId.slice(-6)} as ${handshake.role}: the manager kept another`
        : `${this.#who} failed to connect to ${remotePeerId.slice(-6)}: ${message}`,
    );
    // Always dispatched, so the manager can release its claim. Safe after
    // destroy: the event target is already cleared, so the dispatch does
    // nothing.
    this.#eventTarget.dispatchEvent("peerConnectFailed", {
      peerId: remotePeerId,
      error: new PeerConnectError("connection-failed", message, err),
      handshake,
    });
  }

  #waitForIceGathering(
    pc: RTCPeerConnection,
    signal: HandshakeSignal = this.#destroyAbortController.signal,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (pc.iceGatheringState === "complete") {
        resolve();
        return;
      }
      if (pc.signalingState === "closed") {
        reject(new Error("RTCPeerConnection closed"));
        return;
      }

      let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;

      const cleanup = () => {
        clearTimeout(timeoutId);
        pc.removeEventListener("icegatheringstatechange", onGatheringChange);
        pc.removeEventListener("icecandidate", onIceCandidate);
        pc.removeEventListener("signalingstatechange", onSignalingChange);
        signal.removeEventListener("abort", onAbort);
      };

      const onGatheringChange = () => {
        if (pc.iceGatheringState === "complete") {
          cleanup();
          resolve();
        }
      };

      // A null candidate also signals gathering completion in some browsers
      // more reliably than icegatheringstatechange.
      const onIceCandidate = (event: RTCPeerConnectionIceEvent) => {
        if (event.candidate === null) {
          cleanup();
          resolve();
        }
      };

      const onSignalingChange = () => {
        if (pc.signalingState === "closed") {
          cleanup();
          reject(new Error("RTCPeerConnection closed"));
        }
      };

      const onAbort = () => {
        cleanup();
        reject(new Error("ICE gathering aborted"));
      };

      if (signal.aborted) {
        onAbort();
        return;
      }

      timeoutId = setTimeout(() => {
        cleanup();
        resolve(); // Use whatever candidates we have gathered so far
      }, this.#config.iceGatheringTimeout());

      pc.addEventListener("icegatheringstatechange", onGatheringChange);
      pc.addEventListener("icecandidate", onIceCandidate);
      pc.addEventListener("signalingstatechange", onSignalingChange);
      signal.addEventListener("abort", onAbort);
    });
  }

  #waitForConnection(
    pc: RTCPeerConnection,
    channel: RTCDataChannel | undefined,
    signal: HandshakeSignal,
    timeoutMs: number,
  ): Promise<RTCDataChannel> {
    const { promise, resolve, reject } =
      getPromiseWithResolvers<RTCDataChannel>();

    let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;
    let boundChannel: RTCDataChannel | undefined = channel;

    const rejectIfTerminalState = () => {
      if (isTerminalConnectionState(pc.iceConnectionState)) {
        cleanup();
        reject(new Error(`ICE connection ${pc.iceConnectionState}`));
        return true;
      }
      return false;
    };

    const onChannelOpen = () => {
      cleanup();
      if (boundChannel) {
        resolve(boundChannel);
      } else {
        reject(new Error("Data channel missing on open"));
      }
    };

    const onChannelError = () => {
      cleanup();
      reject(new Error("Data channel error"));
    };

    const onChannelClose = () => {
      cleanup();
      reject(new Error("Data channel closed prematurely"));
    };

    const bindDataChannel = (dc: RTCDataChannel) => {
      boundChannel = dc;
      if (dc.readyState === "open") {
        onChannelOpen();
      } else if (dc.readyState === "closed" || dc.readyState === "closing") {
        onChannelClose();
      } else {
        dc.addEventListener("open", onChannelOpen);
        dc.addEventListener("error", onChannelError);
        dc.addEventListener("close", onChannelClose);
        dc.addEventListener("closing", onChannelClose);
      }
    };

    const onDataChannel = (event: RTCDataChannelEvent) => {
      if (!boundChannel) {
        bindDataChannel(event.channel);
      }
    };

    const onAbort = () => {
      cleanup();
      reject(new Error("Connection aborted"));
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      pc.removeEventListener("iceconnectionstatechange", rejectIfTerminalState);
      pc.removeEventListener("datachannel", onDataChannel);

      if (boundChannel) {
        boundChannel.removeEventListener("open", onChannelOpen);
        boundChannel.removeEventListener("error", onChannelError);
        boundChannel.removeEventListener("close", onChannelClose);
        boundChannel.removeEventListener("closing", onChannelClose);
      }
      signal.removeEventListener("abort", onAbort);
    };

    if (signal.aborted) {
      onAbort();
      return promise;
    }

    if (rejectIfTerminalState()) return promise;

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Data channel open timeout"));
    }, timeoutMs);

    pc.addEventListener("iceconnectionstatechange", rejectIfTerminalState);
    signal.addEventListener("abort", onAbort);

    if (boundChannel) {
      bindDataChannel(boundChannel);
    } else {
      pc.addEventListener("datachannel", onDataChannel);
    }

    return promise;
  }

  #cleanupPendingOffer(offerId: string, pending?: PendingOffer): void {
    const entry = pending ?? this.#pendingOffers.get(offerId);
    if (entry) {
      clearTimeout(entry.timeoutId);
      entry.connection.close();
      this.#pendingOffers.delete(offerId);
    }
  }

  #cleanupPendingOffers(): void {
    for (const [offerId, pending] of this.#pendingOffers) {
      this.#cleanupPendingOffer(offerId, pending);
    }
  }

  #cleanupNegotiatingConnections(): void {
    for (const pc of this.#negotiatingConnections) {
      pc.close();
    }
    this.#negotiatingConnections.clear();
  }
}
