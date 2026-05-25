import { EventTarget } from "../../utils/event-target.js";
import { getRTCErrorMessage, isTerminalConnectionState } from "../utils.js";
import { WebTorrentClient } from "../webtorrent-client/index.js";
import { WebTorrentSocketPool } from "../webtorrent-socket-pool/index.js";

export interface WebTorrentManagerConfig {
  infoHash: string;
  peerId: string;
  trackerUrls: string[];
  rtcConfig?: RTCConfiguration;
  channelConfig?: RTCDataChannelInit;
  socketPool: WebTorrentSocketPool;
}

export type WebTorrentManagerEventMap = {
  peerConnected: (event: {
    peerId: string;
    connection: RTCPeerConnection;
    channel: RTCDataChannel;
    trackerUrl: string;
    close: (error?: string) => void;
  }) => void;
  peerDisconnected: (event: {
    peerId: string;
    trackerUrl: string;
    reason: string;
    isError: boolean;
  }) => void;
  peerConnectFailed: (event: {
    peerId: string;
    trackerUrl: string;
    error: string;
  }) => void;
  warning: (event: { trackerUrl: string; warning: string }) => void;
  error: (event: { trackerUrl: string; error: string }) => void;
};

type ConnectedPeer = {
  connection: RTCPeerConnection;
  channel: RTCDataChannel;
  trackerUrl: string;
  cleanup: () => void;
};

export class WebTorrentManager {
  readonly #config: WebTorrentManagerConfig;
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

    this.#connectingPeers.add(remotePeerId);
    return true;
  };

  constructor(config: WebTorrentManagerConfig) {
    this.#config = config;
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

        let client: WebTorrentClient;
        try {
          client = new WebTorrentClient({
            infoHash: this.#config.infoHash,
            peerId: this.#config.peerId,
            wsClient,
            rtcConfig: this.#config.rtcConfig,
            channelConfig: this.#config.channelConfig,
            claimPeer: this.#claimPeer,
          });
        } catch (error) {
          release();
          throw error;
        }

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
          error: string;
        }) => {
          if (this.#connectingPeers.has(event.peerId)) {
            this.#connectingPeers.delete(event.peerId);
            this.#eventTarget.dispatchEvent("peerConnectFailed", {
              peerId: event.peerId,
              trackerUrl: url,
              error: `Connection failed: ${event.error}`,
            });
          }
        };

        const onWarning = (warning: string) => {
          this.#eventTarget.dispatchEvent("warning", {
            trackerUrl: url,
            warning,
          });
        };

        const onError = (error: string) => {
          this.#eventTarget.dispatchEvent("error", { trackerUrl: url, error });
        };

        client.addEventListener("peerConnected", onPeerConnected);
        client.addEventListener("peerConnectFailed", onPeerConnectFailed);
        client.addEventListener("warning", onWarning);
        client.addEventListener("error", onError);

        const cleanupListeners = () => {
          client.removeEventListener("peerConnected", onPeerConnected);
          client.removeEventListener("peerConnectFailed", onPeerConnectFailed);
          client.removeEventListener("warning", onWarning);
          client.removeEventListener("error", onError);
        };

        this.#clients.add({
          client,
          releaseSocket: release,
          cleanupListeners,
        });

        client.start();
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
      peer.connection.close();
      this.#eventTarget.dispatchEvent("peerDisconnected", {
        peerId,
        trackerUrl: peer.trackerUrl,
        reason: "Manager destroyed",
        isError: false,
      });
    }

    this.#eventTarget.clear();
  }

  #closePeer(peerId: string, reason: string, isError: boolean): void {
    if (this.#destroyed) return;

    const connected = this.#connectedPeers.get(peerId);
    if (connected) {
      connected.cleanup();
      connected.connection.close();
      this.#connectedPeers.delete(peerId);
      this.#eventTarget.dispatchEvent("peerDisconnected", {
        peerId,
        trackerUrl: connected.trackerUrl,
        reason,
        isError,
      });
    }
  }

  #addConnectedPeer(
    peerId: string,
    connection: RTCPeerConnection,
    channel: RTCDataChannel,
    trackerUrl: string,
  ): void {
    if (
      isTerminalConnectionState(connection.connectionState) ||
      isTerminalConnectionState(connection.iceConnectionState)
    ) {
      connection.close();
      this.#eventTarget.dispatchEvent("peerConnectFailed", {
        peerId,
        trackerUrl,
        error: "Connection failed during promotion",
      });
      return;
    }

    const onDisconnect = (reason: string, isError: boolean) =>
      this.#closePeer(peerId, reason, isError);

    const onConnectionStateChange = () => {
      if (isTerminalConnectionState(connection.connectionState)) {
        onDisconnect(
          `Connection state became ${connection.connectionState}`,
          true,
        );
      }
    };

    const onIceConnectionStateChange = () => {
      if (isTerminalConnectionState(connection.iceConnectionState)) {
        onDisconnect(
          `ICE connection state became ${connection.iceConnectionState}`,
          true,
        );
      }
    };

    const onChannelClose = () => onDisconnect("Data channel closed", false);
    const onChannelClosing = () => onDisconnect("Data channel closing", false);
    const onChannelError = (event: Event) => {
      const msg = getRTCErrorMessage(event, "Data channel error");
      onDisconnect(`Data channel error: ${msg}`, true);
    };

    // Indirection so that cleanup() can null out the reference. Without this,
    // the close() closure exposed in the peerConnected event would capture
    // `this` permanently, preventing GC of the manager after destruction.
    let closeRef: ((error?: string) => void) | null = (error) =>
      this.#closePeer(peerId, error ?? "Closed by consumer", !!error);

    const cleanup = () => {
      closeRef = null;
      connection.removeEventListener(
        "connectionstatechange",
        onConnectionStateChange,
      );
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
      "connectionstatechange",
      onConnectionStateChange,
    );
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
      close: (error?: string) => closeRef?.(error),
    });
  }
}
