import {
  PeerError,
  TrackerError,
  TrackerWarning,
  PeerConnectError,
} from "../../types.js";
import { EventTarget } from "../../utils/event-target.js";
import { getRTCErrorMessage, isTerminalConnectionState } from "../utils.js";
import { WebTorrentClient } from "../webtorrent-client/index.js";
import { WebTorrentSocketPool } from "../webtorrent-socket-pool/index.js";

export interface WebTorrentManagerConfig {
  infoHash: string;
  peerId: string;
  trackerUrls: string[];
  rtcConfig?: () => RTCConfiguration | undefined;
  channelConfig?: RTCDataChannelInit;
  socketPool: WebTorrentSocketPool;
  offersCount?: () => number;
  offerTimeout?: () => number;
  iceGatheringTimeout?: () => number;
  connectionTimeout?: () => number;
  maxPeers?: () => number;
}

export type WebTorrentManagerEventMap = {
  peerConnected: (event: {
    peerId: string;
    connection: RTCPeerConnection;
    channel: RTCDataChannel;
    trackerUrl: string;
    close: (error?: PeerError) => void;
  }) => void;
  peerDisconnected: (
    event: {
      peerId: string;
      trackerUrl: string;
    } & (
      | { error: PeerError; disconnectReason?: never }
      | { error?: never; disconnectReason: string }
    ),
  ) => void;
  peerConnectFailed: (event: {
    peerId: string;
    trackerUrl: string;
    error: PeerConnectError;
  }) => void;
  warning: (event: { trackerUrl: string; warning: TrackerWarning }) => void;
  error: (event: { trackerUrl: string; error: TrackerError }) => void;
};

type ConnectedPeer = {
  connection: RTCPeerConnection;
  channel: RTCDataChannel;
  trackerUrl: string;
  cleanup: () => void;
};

const WEBTORRENT_DEFAULT_MAX_PEERS = 50;

export class WebTorrentManager {
  readonly #config: WebTorrentManagerConfig & { maxPeers: () => number };
  readonly #eventTarget = new EventTarget<WebTorrentManagerEventMap>();

  readonly #connectingPeers = new Set<string>();
  readonly #connectedPeers = new Map<string, ConnectedPeer>();

  readonly #clients = new Set<{
    client: WebTorrentClient;
    releaseSocket: () => void;
    cleanupListeners: () => void;
  }>();

  #destroyed = false;
  #started = false;

  #claimPeer = (remotePeerId: string): boolean => {
    if (this.#destroyed) return false;

    if (
      this.#connectingPeers.has(remotePeerId) ||
      this.#connectedPeers.has(remotePeerId)
    ) {
      return false;
    }

    if (this.#connectingPeers.size + this.#connectedPeers.size >= this.#config.maxPeers()) {
      return false;
    }

    this.#connectingPeers.add(remotePeerId);
    return true;
  };

  constructor(config: WebTorrentManagerConfig) {
    this.#config = {
      ...config,
      maxPeers: config.maxPeers ?? (() => WEBTORRENT_DEFAULT_MAX_PEERS),
    };
  }

  public addEventListener<K extends keyof WebTorrentManagerEventMap>(
    eventName: K,
    listener: WebTorrentManagerEventMap[K],
  ): void {
    this.#eventTarget.addEventListener(eventName, listener);
  }

  public removeEventListener<K extends keyof WebTorrentManagerEventMap>(
    eventName: K,
    listener: WebTorrentManagerEventMap[K],
  ): void {
    this.#eventTarget.removeEventListener(eventName, listener);
  }

  public start(): void {
    if (this.#destroyed || this.#started) return;
    this.#started = true;

    try {
      for (const url of this.#config.trackerUrls) {
        const { client: wsClient, release } =
          this.#config.socketPool.acquire(url);

        let addedToClients = false;
        try {
          const client = new WebTorrentClient({
            infoHash: this.#config.infoHash,
            peerId: this.#config.peerId,
            wsClient,
            rtcConfig: this.#config.rtcConfig,
            channelConfig: this.#config.channelConfig,
            claimPeer: this.#claimPeer,
            offersCount: this.#config.offersCount,
            offerTimeout: this.#config.offerTimeout,
            iceGatheringTimeout: this.#config.iceGatheringTimeout,
            connectionTimeout: this.#config.connectionTimeout,
            shouldGenerateOffers: () =>
              this.#connectingPeers.size + this.#connectedPeers.size < this.#config.maxPeers(),
          });

          const onPeerConnected = (event: {
            peerId: string;
            connection: RTCPeerConnection;
            channel: RTCDataChannel;
          }) => {
            this.#connectingPeers.delete(event.peerId);
            this.#addConnectedPeer(
              event.peerId,
              event.connection,
              event.channel,
              url,
            );
          };

          const onPeerConnectFailed = (event: {
            peerId: string;
            error: PeerConnectError;
          }) => {
            if (this.#connectingPeers.has(event.peerId)) {
              this.#connectingPeers.delete(event.peerId);
              this.#eventTarget.dispatchEvent("peerConnectFailed", {
                peerId: event.peerId,
                trackerUrl: url,
                error: event.error,
              });
            }
          };

          const onWarning = (warning: TrackerWarning) => {
            this.#eventTarget.dispatchEvent("warning", {
              trackerUrl: url,
              warning,
            });
          };

          const onError = (error: TrackerError) => {
            this.#eventTarget.dispatchEvent("error", {
              trackerUrl: url,
              error,
            });
          };

          client.addEventListener("peerConnected", onPeerConnected);
          client.addEventListener("peerConnectFailed", onPeerConnectFailed);
          client.addEventListener("warning", onWarning);
          client.addEventListener("error", onError);

          const cleanupListeners = () => {
            client.removeEventListener("peerConnected", onPeerConnected);
            client.removeEventListener(
              "peerConnectFailed",
              onPeerConnectFailed,
            );
            client.removeEventListener("warning", onWarning);
            client.removeEventListener("error", onError);
          };

          this.#clients.add({
            client,
            releaseSocket: release,
            cleanupListeners,
          });
          addedToClients = true;

          client.start();
        } catch (error) {
          if (!addedToClients) {
            release();
          }
          throw error;
        }
      }
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  public destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;

    // Remove our listeners BEFORE destroying the client. This ensures that
    // if client.destroy() synchronously dispatches events,
    // they won't reach this already-destroyed manager.
    for (const { client, releaseSocket, cleanupListeners } of this.#clients) {
      cleanupListeners();
      client.destroy();
      releaseSocket();
    }
    this.#clients.clear();

    this.#connectingPeers.clear();

    const connectedSnapshot = [...this.#connectedPeers.entries()];
    this.#connectedPeers.clear();

    for (const [peerId, peer] of connectedSnapshot) {
      peer.cleanup();
      try {
        peer.channel.close();
      } catch {
        // ignore
      }
      try {
        peer.connection.close();
      } catch {
        // ignore
      }
      this.#eventTarget.dispatchEvent("peerDisconnected", {
        peerId,
        trackerUrl: peer.trackerUrl,
        disconnectReason: "Manager destroyed",
      });
    }

    this.#eventTarget.clear();
  }

  #closePeer(
    peerId: string,
    cause:
      | { error: PeerError; disconnectReason?: never }
      | { error?: never; disconnectReason: string },
  ): void {
    if (this.#destroyed) return;

    const connected = this.#connectedPeers.get(peerId);
    if (!connected) return;

    // Synchronously extract from map first to prevent re-entrant double-fire
    // if close() synchronously triggers event listeners.
    this.#connectedPeers.delete(peerId);

    connected.cleanup();
    try {
      connected.channel.close();
    } catch {
      // ignore
    }
    try {
      connected.connection.close();
    } catch {
      // ignore
    }
    this.#eventTarget.dispatchEvent("peerDisconnected", {
      peerId,
      trackerUrl: connected.trackerUrl,
      ...cause,
    });
  }

  #addConnectedPeer(
    peerId: string,
    connection: RTCPeerConnection,
    channel: RTCDataChannel,
    trackerUrl: string,
  ): void {
    if (isTerminalConnectionState(connection.iceConnectionState)) {
      try {
        connection.close();
      } catch {
        // ignore
      }
      this.#eventTarget.dispatchEvent("peerConnectFailed", {
        peerId,
        trackerUrl,
        error: new PeerConnectError(
          "connection-failed",
          "Connection failed during promotion",
        ),
      });
      return;
    }

    const onDisconnect = (
      cause:
        | { error: PeerError; disconnectReason?: never }
        | { error?: never; disconnectReason: string },
    ) => this.#closePeer(peerId, cause);

    const onIceConnectionStateChange = () => {
      if (isTerminalConnectionState(connection.iceConnectionState)) {
        onDisconnect({
          error: new PeerError(
            "connection-lost",
            `ICE connection state became ${connection.iceConnectionState}`,
          ),
        });
      }
    };

    const onChannelClose = () =>
      onDisconnect({ disconnectReason: "Data channel closed" });
    const onChannelClosing = () =>
      onDisconnect({ disconnectReason: "Data channel closing" });
    const onChannelError = (event: Event) => {
      const msg = getRTCErrorMessage(event, "Data channel error");
      onDisconnect({
        error: new PeerError("transport-error", `Data channel error: ${msg}`),
      });
    };

    // Indirection so that cleanup() can null out the reference. Without this,
    // the close() closure exposed in the peerConnected event would capture
    // `this` permanently, preventing GC of the manager after destruction.
    let closeRef: ((error?: PeerError) => void) | null = (error) =>
      this.#closePeer(
        peerId,
        error ? { error } : { disconnectReason: "Closed by consumer" },
      );

    const cleanup = () => {
      closeRef = null;
      connection.removeEventListener(
        "iceconnectionstatechange",
        onIceConnectionStateChange,
      );
      channel.removeEventListener("close", onChannelClose);
      channel.removeEventListener("closing", onChannelClosing);
      channel.removeEventListener("error", onChannelError);
    };

    this.#connectedPeers.set(peerId, {
      connection,
      channel,
      trackerUrl,
      cleanup,
    });

    connection.addEventListener(
      "iceconnectionstatechange",
      onIceConnectionStateChange,
    );
    channel.addEventListener("close", onChannelClose);
    channel.addEventListener("closing", onChannelClosing);
    channel.addEventListener("error", onChannelError);

    this.#eventTarget.dispatchEvent("peerConnected", {
      peerId,
      connection,
      channel,
      trackerUrl,
      close: (error?: PeerError) => closeRef?.(error),
    });
  }
}
