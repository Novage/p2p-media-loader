import { EventTarget } from "../../utils/event-target.js";
import { getPromiseWithResolvers } from "../../utils/utils.js";
import { isTerminalConnectionState } from "../utils.js";
import { WebSocketClient } from "../websocket-client/index.js";
import { SafeAbortController } from "../../utils/abort-controller.js";

import {
  PeerConnection,
  SessionDescription,
  safeCreateOffer,
  safeCreateAnswer,
  safeSetLocalDescription,
  safeSetRemoteDescription,
} from "./webrtc-utils.js";

export type WebTorrentClientEventMap = {
  peerConnected: (event: {
    peerId: string;
    connection: RTCPeerConnection;
    channel: RTCDataChannel;
  }) => void;
  peerConnectFailed: (event: { peerId: string; error: string }) => void;
  warning: (warning: string) => void;
  error: (error: string) => void;
};

const WEBTORRENT_DEFAULT_OFFER_TIMEOUT = 50000;
const WEBTORRENT_DEFAULT_CONNECTION_TIMEOUT = 15000;
const WEBTORRENT_DEFAULT_OFFERS_COUNT = 5;

export interface WebTorrentClientConfig {
  wsClient: WebSocketClient;
  infoHash: string;
  peerId: string;
  rtcConfig?: RTCConfiguration;
  channelConfig?: RTCDataChannelInit;
  offerTimeout?: number;
  offersCount?: number;
  connectionTimeout?: number;
  claimPeer?: (peerId: string) => boolean;
  shouldGenerateOffers?: () => boolean;
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

function isSessionDescriptionInit(
  value: unknown,
): value is RTCSessionDescriptionInit {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.type === "string" && typeof obj.sdp === "string";
}

export class WebTorrentClient {
  static readonly #DEFAULT_ANNOUNCE_INTERVAL_SECONDS = 120;
  static readonly #ICE_GATHERING_TIMEOUT = 5_000;

  readonly #config: Required<
    Omit<WebTorrentClientConfig, "rtcConfig" | "channelConfig" | "wsClient">
  > & {
    rtcConfig?: RTCConfiguration;
    channelConfig?: RTCDataChannelInit;
  };

  readonly #wsClient: WebSocketClient;
  readonly #eventTarget = new EventTarget<WebTorrentClientEventMap>();
  readonly #pendingOffers = new Map<string, PendingOffer>();
  readonly #negotiatingConnections = new Set<RTCPeerConnection>();
  readonly #destroyAbortController = new SafeAbortController();

  #announceTimeoutId: ReturnType<typeof setTimeout> | null = null;
  #announceIntervalSeconds: number | null = null;
  #announceRunId = 0;
  #trackerId: string | null = null;
  #started = false;

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
      offerTimeout: config.offerTimeout ?? WEBTORRENT_DEFAULT_OFFER_TIMEOUT,
      offersCount: config.offersCount ?? WEBTORRENT_DEFAULT_OFFERS_COUNT,
      connectionTimeout:
        config.connectionTimeout ?? WEBTORRENT_DEFAULT_CONNECTION_TIMEOUT,
      claimPeer: config.claimPeer ?? (() => true),
      shouldGenerateOffers: config.shouldGenerateOffers ?? (() => true),
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

  public start(): void {
    if (this.#isDestroyed() || this.#started) return;
    this.#started = true;

    this.#wsClient.addEventListener("connected", this.#onWsConnected);
    this.#wsClient.addEventListener("disconnected", this.#onWsDisconnected);
    this.#wsClient.addEventListener("message", this.#onWsMessage);

    if (this.#wsClient.state === "connected") {
      this.#onWsConnected();
    }
  }

  public destroy(): void {
    if (this.#isDestroyed()) return;
    this.#destroyAbortController.abort();
    this.#clearAnnounceTimeout();

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
    // Setup a fallback interval in case the tracker doesn't provide one
    this.#scheduleAnnounce(WebTorrentClient.#DEFAULT_ANNOUNCE_INTERVAL_SECONDS);

    // Send the initial announce event
    this.#announce("started").catch((err: unknown) => {
      if (this.#isDestroyed()) return;

      this.#eventTarget.dispatchEvent(
        "error",
        `Initial announce failed: ${String(err)}`,
      );
    });
  };

  #onWsDisconnected = (): void => {
    this.#clearAnnounceTimeout();
    this.#announceIntervalSeconds = null;
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
        `Failed to parse tracker message: ${String(err)}`,
      );
      return;
    }

    if (typeof msg !== "object" || msg === null || Array.isArray(msg)) return;
    const dataObject = msg as Record<string, unknown>;

    const warningMessage = dataObject["warning message"];
    if (typeof warningMessage === "string") {
      this.#eventTarget.dispatchEvent("warning", warningMessage);
    }

    const failureReason = dataObject["failure reason"];
    if (typeof failureReason === "string") {
      this.#eventTarget.dispatchEvent("error", failureReason);
      return;
    }

    const { interval } = dataObject;
    if (typeof interval === "number" && interval > 0) {
      if (this.#announceIntervalSeconds !== interval) {
        this.#scheduleAnnounce(interval);
      }
    }

    // The WebTorrent tracker protocol specifies "tracker id" (with a space) in the
    // response, but expects it to be echoed back as "trackerid" (no space) in
    // subsequent announce requests. We store it here and send it back later.
    const trackerId = dataObject["tracker id"];
    if (typeof trackerId === "string") {
      this.#trackerId = trackerId;
    }

    // Ignore messages for a different torrent (possible on shared WebSocket connections)
    const infoHash = dataObject.info_hash;
    if (typeof infoHash === "string" && infoHash !== this.#config.infoHash) {
      return;
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
          `Failed to handle offer: ${String(err)}`,
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
          `Failed to handle answer: ${String(err)}`,
        );
      });
    }
  };

  #scheduleAnnounce(intervalSeconds: number): void {
    this.#clearAnnounceTimeout();
    this.#announceIntervalSeconds = intervalSeconds;

    const runId = ++this.#announceRunId;

    const run = async () => {
      try {
        await this.#announce();
      } catch (err: unknown) {
        if (this.#isDestroyed()) return;
        this.#eventTarget.dispatchEvent(
          "error",
          `Announce failed: ${String(err)}`,
        );
      }

      if (
        !this.#isDestroyed() &&
        this.#announceIntervalSeconds !== null &&
        this.#announceRunId === runId
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

  async #announce(event?: "started"): Promise<void> {
    if (this.#isDestroyed() || this.#wsClient.state !== "connected") return;

    const shouldGenerateOffers = this.#config.shouldGenerateOffers();
    const offersCount = shouldGenerateOffers ? this.#config.offersCount : 0;

    // Generate offers in parallel to avoid sequential ICE gathering latency
    // Don't use Promise.allSettled to support older browsers
    const results = await Promise.all(
      Array.from({ length: offersCount }, () =>
        this.#createOffer().then(
          (value) => value,
          () => undefined,
        ),
      ),
    );

    if (this.#isDestroyed()) {
      for (const result of results) {
        if (result) {
          this.#cleanupPendingOffer(result.offer_id);
        }
      }
      return;
    }

    const offers: { offer: { type: string; sdp: string }; offer_id: string }[] =
      [];

    for (const result of results) {
      if (result) {
        offers.push(result);
      }
    }

    const payload = this.#buildAnnouncePayload({
      numwant: offers.length,
      offers,
      event,
    });

    try {
      this.#wsClient.send(JSON.stringify(payload));
    } catch (err: unknown) {
      for (const offer of offers) {
        this.#cleanupPendingOffer(offer.offer_id);
      }
      throw err;
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
      pc = new PeerConnection(this.#config.rtcConfig);
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
        }, this.#config.offerTimeout),
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
          `Failed to create offer: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return undefined;
    } finally {
      if (pc) {
        this.#negotiatingConnections.delete(pc);
      }
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
    const payload: Record<string, unknown> = {
      action: "announce",
      info_hash: this.#config.infoHash,
      peer_id: this.#config.peerId,
      numwant,
      uploaded: 0,
      downloaded: 0,
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

    if (!this.#config.claimPeer(remotePeerId)) {
      return; // Reject offer silently
    }

    let pc: RTCPeerConnection | undefined;
    try {
      pc = new PeerConnection(this.#config.rtcConfig);
      this.#negotiatingConnections.add(pc);

      await safeSetRemoteDescription(pc, new SessionDescription(offerSdp));
      this.#throwIfDestroyed();

      const answer = await safeCreateAnswer(pc);
      this.#throwIfDestroyed();

      await safeSetLocalDescription(pc, answer);
      this.#throwIfDestroyed();

      await this.#waitForIceGathering(pc);
      this.#throwIfDestroyed();

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

      const channel = await this.#waitForConnection(pc);
      this.#throwIfDestroyed();

      this.#eventTarget.dispatchEvent("peerConnected", {
        peerId: remotePeerId,
        connection: pc,
        channel,
      });
    } catch (err: unknown) {
      pc?.close();
      if (!this.#isDestroyed()) {
        this.#eventTarget.dispatchEvent("peerConnectFailed", {
          peerId: remotePeerId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
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
    if (!pending) return; // Offer expired or invalid

    // Stop tracking it as pending
    this.#pendingOffers.delete(ourOfferId);
    clearTimeout(pending.timeoutId);

    if (!this.#config.claimPeer(remotePeerId)) {
      pending.connection.close();
      return; // Reject answer silently
    }

    this.#negotiatingConnections.add(pending.connection);

    try {
      await safeSetRemoteDescription(
        pending.connection,
        new SessionDescription(answerSdp),
      );
      this.#throwIfDestroyed();

      const channel = await this.#waitForConnection(
        pending.connection,
        pending.channel,
      );
      this.#throwIfDestroyed();

      this.#eventTarget.dispatchEvent("peerConnected", {
        peerId: remotePeerId,
        connection: pending.connection,
        channel,
      });
    } catch (err: unknown) {
      pending.connection.close();
      if (!this.#isDestroyed()) {
        this.#eventTarget.dispatchEvent("peerConnectFailed", {
          peerId: remotePeerId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      this.#negotiatingConnections.delete(pending.connection);
    }
  }

  #waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
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
        this.#destroyAbortController.signal.removeEventListener(
          "abort",
          onAbort,
        );
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
        reject(new Error("ICE gathering aborted due to teardown"));
      };

      if (this.#destroyAbortController.signal.aborted) {
        onAbort();
        return;
      }

      timeoutId = setTimeout(() => {
        cleanup();
        resolve(); // Use whatever candidates we have gathered so far
      }, WebTorrentClient.#ICE_GATHERING_TIMEOUT);

      pc.addEventListener("icegatheringstatechange", onGatheringChange);
      pc.addEventListener("icecandidate", onIceCandidate);
      pc.addEventListener("signalingstatechange", onSignalingChange);
      this.#destroyAbortController.signal.addEventListener("abort", onAbort);
    });
  }

  #waitForConnection(
    pc: RTCPeerConnection,
    channel?: RTCDataChannel,
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
      reject(new Error("Connection aborted due to teardown"));
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
      this.#destroyAbortController.signal.removeEventListener("abort", onAbort);
    };

    if (this.#destroyAbortController.signal.aborted) {
      onAbort();
      return promise;
    }

    if (rejectIfTerminalState()) return promise;

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Data channel open timeout"));
    }, this.#config.connectionTimeout);

    pc.addEventListener("iceconnectionstatechange", rejectIfTerminalState);
    this.#destroyAbortController.signal.addEventListener("abort", onAbort);

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
