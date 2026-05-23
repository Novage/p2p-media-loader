import { EventTarget } from "../../utils/event-target.js";
import {
  WebSocketClient,
  WebSocketClientState,
} from "../websocket-client/index.js";

export type WebTorrentClientEventMap = {
  peerSignaled: (event: {
    peerId: string;
    connection: RTCPeerConnection;
    channel?: RTCDataChannel;
  }) => void;
  peerSignalingFailed: (event: { peerId: string; error: string }) => void;
  warning: (warning: string) => void;
  error: (error: string) => void;
};

export type WebTorrentClientState = WebSocketClientState;

const WEBTORRENT_DEFAULT_OFFER_TIMEOUT = 50000;

export interface WebTorrentClientConfig {
  wsClient: WebSocketClient;
  infoHash: string;
  peerId: string;
  rtcConfig?: RTCConfiguration;
  channelConfig?: RTCDataChannelInit;
  offerTimeout?: number;
  offersCount?: number;
  claimPeer?: (peerId: string, timeout: number) => boolean;
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
  readonly #destroyAbortController = new AbortController();

  #announceIntervalId: ReturnType<typeof setInterval> | null = null;
  #announceIntervalSeconds: number | null = null;
  #trackerId: string | null = null;
  #destroyed = false;

  constructor(config: WebTorrentClientConfig) {
    this.#config = {
      infoHash: config.infoHash,
      peerId: config.peerId,
      rtcConfig: config.rtcConfig,
      channelConfig: config.channelConfig,
      offerTimeout: config.offerTimeout ?? WEBTORRENT_DEFAULT_OFFER_TIMEOUT,
      offersCount: config.offersCount ?? 5,
      claimPeer: config.claimPeer ?? (() => true),
      shouldGenerateOffers: config.shouldGenerateOffers ?? (() => true),
    };

    this.#wsClient = config.wsClient;

    this.#wsClient.addEventListener("connected", this.#onWsConnected);
    this.#wsClient.addEventListener("disconnected", this.#onWsDisconnected);
    this.#wsClient.addEventListener("message", this.#onWsMessage);
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
    if (this.#destroyed) return;

    if (this.#wsClient.state === "connected") {
      this.#onWsConnected();
    }
  }

  public destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#clearAnnounceInterval();

    this.#sendStopped();

    this.#cleanupPendingOffers();
    this.#cleanupNegotiatingConnections();
    this.#destroyAbortController.abort();

    this.#wsClient.removeEventListener("connected", this.#onWsConnected);
    this.#wsClient.removeEventListener("disconnected", this.#onWsDisconnected);
    this.#wsClient.removeEventListener("message", this.#onWsMessage);

    this.#eventTarget.clear();
  }

  #onWsConnected = (): void => {
    // Setup a fallback interval in case the tracker doesn't provide one
    this.#scheduleAnnounce(WebTorrentClient.#DEFAULT_ANNOUNCE_INTERVAL_SECONDS);

    // Send the initial announce event
    this.#announce("started").catch((err: unknown) => {
      this.#eventTarget.dispatchEvent(
        "error",
        `Initial announce failed: ${String(err)}`,
      );
    });
  };

  #onWsDisconnected = (): void => {
    this.#clearAnnounceInterval();
    this.#announceIntervalSeconds = null;
  };

  #onWsMessage = (data: ArrayBuffer | string): void => {
    if (this.#destroyed) return;

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
      try {
        this.#eventTarget.dispatchEvent("warning", warningMessage);
      } catch {
        // Ignore user-land errors
      }
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
        this.#eventTarget.dispatchEvent(
          "error",
          `Failed to handle answer: ${String(err)}`,
        );
      });
    }
  };

  #scheduleAnnounce(intervalSeconds: number): void {
    this.#clearAnnounceInterval();
    this.#announceIntervalSeconds = intervalSeconds;
    this.#announceIntervalId = setInterval(() => {
      this.#announce().catch((err: unknown) => {
        this.#eventTarget.dispatchEvent(
          "error",
          `Announce failed: ${String(err)}`,
        );
      });
    }, intervalSeconds * 1000);
  }

  #clearAnnounceInterval(): void {
    if (this.#announceIntervalId !== null) {
      clearInterval(this.#announceIntervalId);
      this.#announceIntervalId = null;
    }
  }

  async #announce(event?: "started"): Promise<void> {
    if (this.#wsClient.state !== "connected") return;

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

    if (this.#checkDestroyed()) return;

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
    } catch (err) {
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
    let pc: RTCPeerConnection | undefined;
    try {
      pc = new RTCPeerConnection(this.#config.rtcConfig);
      this.#negotiatingConnections.add(pc);

      const channel = pc.createDataChannel(
        "webtorrent",
        this.#config.channelConfig,
      );

      const offer = await pc.createOffer();
      if (this.#checkDestroyed()) return undefined;

      await pc.setLocalDescription(offer);
      if (this.#checkDestroyed()) return undefined;

      await this.#waitForIceGathering(pc);
      if (this.#checkDestroyed()) return undefined;

      const sdp = pc.localDescription;
      if (!sdp) {
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
      this.#eventTarget.dispatchEvent(
        "error",
        `Failed to create offer: ${String(err)}`,
      );
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
    offers: unknown[];
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
    if (!this.#config.claimPeer(remotePeerId, this.#config.offerTimeout)) {
      return; // Reject offer silently
    }

    const pc = new RTCPeerConnection(this.#config.rtcConfig);
    this.#negotiatingConnections.add(pc);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
      if (this.#checkDestroyed()) return;

      const answer = await pc.createAnswer();
      if (this.#checkDestroyed()) return;

      await pc.setLocalDescription(answer);
      if (this.#checkDestroyed()) return;

      await this.#waitForIceGathering(pc);
      if (this.#checkDestroyed()) return;

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
    } catch (err) {
      pc.close();
      this.#eventTarget.dispatchEvent("peerSignalingFailed", {
        peerId: remotePeerId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      this.#negotiatingConnections.delete(pc);
    }

    this.#eventTarget.dispatchEvent("peerSignaled", {
      peerId: remotePeerId,
      connection: pc,
    });
  }

  async #handleIncomingAnswer({
    sdp: answerSdp,
    peerId: remotePeerId,
    offerId: ourOfferId,
  }: IncomingAnswer): Promise<void> {
    const pending = this.#pendingOffers.get(ourOfferId);
    if (!pending) return; // Offer expired or invalid

    // Stop tracking it as pending
    this.#pendingOffers.delete(ourOfferId);
    clearTimeout(pending.timeoutId);

    if (!this.#config.claimPeer(remotePeerId, this.#config.offerTimeout)) {
      pending.connection.close();
      return; // Reject answer silently
    }

    this.#negotiatingConnections.add(pending.connection);

    try {
      await pending.connection.setRemoteDescription(
        new RTCSessionDescription(answerSdp),
      );

      if (this.#checkDestroyed()) return;
    } catch (err) {
      pending.connection.close();
      this.#eventTarget.dispatchEvent("peerSignalingFailed", {
        peerId: remotePeerId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      this.#negotiatingConnections.delete(pending.connection);
    }

    this.#eventTarget.dispatchEvent("peerSignaled", {
      peerId: remotePeerId,
      connection: pending.connection,
      channel: pending.channel,
    });
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
        reject(new Error("ICE gathering timed out"));
      }, WebTorrentClient.#ICE_GATHERING_TIMEOUT);

      pc.addEventListener("icegatheringstatechange", onGatheringChange);
      pc.addEventListener("icecandidate", onIceCandidate);
      this.#destroyAbortController.signal.addEventListener("abort", onAbort);
    });
  }

  /**
   * Opaque destroyed check for use after `await` boundaries.
   * Using a method call prevents TypeScript's control-flow narrowing
   * from incorrectly eliminating the check as "always falsy".
   */
  #checkDestroyed(): boolean {
    return this.#destroyed;
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
