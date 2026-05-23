import { EventTarget } from "../../utils/event-target.js";
import { getRTCErrorMessage } from "../utils.js";
import { WebTorrentClient } from "../webtorrent-client/index.js";
import { WebTorrentSocketPool } from "../webtorrent-socket-pool/index.js";

const DATA_CHANNEL_TIMEOUT = 15000;

function isTerminalConnectionState(
  state: RTCIceConnectionState | RTCPeerConnectionState,
): boolean {
  // "disconnected" is technically a transient ICE state that can recover,
  // but for live video streaming we treat it as terminal: dropping the peer
  // immediately and reconnecting via the tracker is faster than waiting for
  // a stale connection to potentially recover.

  return state === "failed" || state === "closed" || state === "disconnected";
}

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

type ConnectingPeer =
  | {
      status: "signaling";
      timeoutId: ReturnType<typeof setTimeout>;
      connection?: undefined;
    }
  | {
      status: "connecting";
      connection: RTCPeerConnection;
      channel?: RTCDataChannel;
      timeoutId: ReturnType<typeof setTimeout>;
      trackerUrl: string;
      cleanup: () => void;
    };

type ConnectedPeer = {
  connection: RTCPeerConnection;
  channel: RTCDataChannel;
  cleanup: () => void;
};

export class WebTorrentManager {
  readonly #config: WebTorrentManagerConfig;
  readonly #eventTarget = new EventTarget<WebTorrentManagerEventMap>();

  readonly #connectingPeers = new Map<string, ConnectingPeer>();
  readonly #connectedPeers = new Map<string, ConnectedPeer>();

  readonly #clients = new Set<{
    client: WebTorrentClient;
    releaseSocket: () => void;
    cleanupListeners: () => void;
  }>();

  #destroyed = false;
  #started = false;

  #claimPeer = (remotePeerId: string, timeout: number): boolean => {
    if (this.#destroyed) return false;

    if (
      this.#connectingPeers.has(remotePeerId) ||
      this.#connectedPeers.has(remotePeerId)
    ) {
      return false;
    }

    const timeoutId = setTimeout(() => {
      const peer = this.#connectingPeers.get(remotePeerId);
      if (peer?.status === "signaling") {
        this.#connectingPeers.delete(remotePeerId);
      }
    }, timeout);

    this.#connectingPeers.set(remotePeerId, {
      status: "signaling",
      timeoutId,
    });
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

        const onPeerSignaled = (event: {
          peerId: string;
          connection: RTCPeerConnection;
          channel?: RTCDataChannel;
        }) => {
          this.#handlePeerSignaled(
            url,
            event.peerId,
            event.connection,
            event.channel,
          );
        };

        const onPeerSignalingFailed = (event: {
          peerId: string;
          error: string;
        }) => {
          const peer = this.#connectingPeers.get(event.peerId);
          if (peer?.status === "signaling") {
            clearTimeout(peer.timeoutId);
            this.#connectingPeers.delete(event.peerId);
            this.#eventTarget.dispatchEvent("peerConnectFailed", {
              peerId: event.peerId,
              trackerUrl: url,
              error: `Signaling failed: ${event.error}`,
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

        client.addEventListener("peerSignaled", onPeerSignaled);
        client.addEventListener("peerSignalingFailed", onPeerSignalingFailed);
        client.addEventListener("warning", onWarning);
        client.addEventListener("error", onError);

        const cleanupListeners = () => {
          client.removeEventListener("peerSignaled", onPeerSignaled);
          client.removeEventListener(
            "peerSignalingFailed",
            onPeerSignalingFailed,
          );
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
    // if client.destroy() synchronously dispatches events (e.g. peerSignaled),
    // they won't reach this already-destroyed manager.
    for (const { client, releaseSocket, cleanupListeners } of this.#clients) {
      cleanupListeners();
      client.destroy();
      releaseSocket();
    }
    this.#clients.clear();

    for (const peer of this.#connectingPeers.values()) {
      if (peer.status === "connecting") {
        peer.cleanup();
      } else {
        clearTimeout(peer.timeoutId);
      }
      peer.connection?.close();
    }
    this.#connectingPeers.clear();

    const connectedSnapshot = [...this.#connectedPeers.entries()];
    this.#connectedPeers.clear();

    for (const [peerId, peer] of connectedSnapshot) {
      peer.cleanup();
      peer.connection.close();
      this.#eventTarget.dispatchEvent("peerDisconnected", {
        peerId,
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
        reason,
        isError,
      });
    }
  }

  #handlePeerSignaled(
    trackerUrl: string,
    peerId: string,
    connection: RTCPeerConnection,
    channel?: RTCDataChannel,
  ): void {
    if (this.#destroyed) {
      connection.close();
      return;
    }

    const signalingPeer = this.#connectingPeers.get(peerId);
    if (!signalingPeer) {
      // It might have been rejected/closed already
      connection.close();
      return;
    }

    if (signalingPeer.status === "connecting") {
      connection.close();
      return;
    }

    // Clear the signaling-phase timeout before replacing the map entry below.
    // The timeout callback only deletes "signaling" entries, so it would be a
    // harmless no-op if it fired after the transition to "connecting". However,
    // clearing it eagerly avoids unnecessary timer retention.
    clearTimeout(signalingPeer.timeoutId);

    const connectingPeer: ConnectingPeer = {
      status: "connecting",
      connection,
      channel,
      trackerUrl,
      timeoutId: setTimeout(() => {
        fail("Data channel open timeout");
      }, DATA_CHANNEL_TIMEOUT),
      cleanup: () => cleanup(),
    };

    let onChannelOpenBound: (() => void) | null = null;
    let onChannelErrorBound: (() => void) | null = null;
    let onChannelCloseBound: (() => void) | null = null;

    const onIceConnectionStateChange = () => {
      checkAndFail(connection.iceConnectionState, "ICE connection");
    };

    const onConnectionStateChange = () => {
      checkAndFail(connection.connectionState, "Connection state");
    };

    const onDataChannel = (event: RTCDataChannelEvent) => {
      if (connectingPeer.channel) return;
      connectingPeer.channel = event.channel;
      bindDataChannel(event.channel);
    };

    const cleanup = () => {
      clearTimeout(connectingPeer.timeoutId);
      connection.removeEventListener(
        "iceconnectionstatechange",
        onIceConnectionStateChange,
      );
      connection.removeEventListener(
        "connectionstatechange",
        onConnectionStateChange,
      );
      connection.removeEventListener("datachannel", onDataChannel);
      if (connectingPeer.channel) {
        if (onChannelOpenBound) {
          connectingPeer.channel.removeEventListener(
            "open",
            onChannelOpenBound,
          );
        }
        if (onChannelErrorBound) {
          connectingPeer.channel.removeEventListener(
            "error",
            onChannelErrorBound,
          );
        }
        if (onChannelCloseBound) {
          connectingPeer.channel.removeEventListener(
            "close",
            onChannelCloseBound,
          );
          connectingPeer.channel.removeEventListener(
            "closing",
            onChannelCloseBound,
          );
        }
      }
    };

    this.#connectingPeers.set(peerId, connectingPeer);

    const fail = (reason: string) => {
      if (!this.#connectingPeers.delete(peerId)) return;
      cleanup();
      connection.close();
      this.#eventTarget.dispatchEvent("peerConnectFailed", {
        peerId,
        trackerUrl,
        error: reason,
      });
    };

    const checkAndFail = (
      state: RTCIceConnectionState | RTCPeerConnectionState,
      prefix: string,
    ) => {
      if (isTerminalConnectionState(state)) {
        fail(`${prefix} ${state}`);
        return true;
      }
      return false;
    };

    if (checkAndFail(connection.iceConnectionState, "ICE connection")) return;
    if (checkAndFail(connection.connectionState, "Connection state")) return;

    connection.addEventListener(
      "iceconnectionstatechange",
      onIceConnectionStateChange,
    );
    connection.addEventListener(
      "connectionstatechange",
      onConnectionStateChange,
    );

    const onChannelOpen = (dataChannel: RTCDataChannel) => {
      cleanup();
      this.#connectingPeers.delete(peerId);
      this.#promoteToConnected(peerId, connection, dataChannel, trackerUrl);
    };

    const bindDataChannel = (dataChannel: RTCDataChannel) => {
      if (dataChannel.readyState === "open") {
        onChannelOpen(dataChannel);
      } else if (
        dataChannel.readyState === "closed" ||
        dataChannel.readyState === "closing"
      ) {
        fail("Data channel closed prematurely");
      } else {
        onChannelOpenBound = () => onChannelOpen(dataChannel);
        onChannelErrorBound = () => fail("Data channel error");
        onChannelCloseBound = () => fail("Data channel closed prematurely");

        dataChannel.addEventListener("open", onChannelOpenBound);
        dataChannel.addEventListener("error", onChannelErrorBound);
        dataChannel.addEventListener("close", onChannelCloseBound);
        dataChannel.addEventListener("closing", onChannelCloseBound);
      }
    };

    if (channel) {
      bindDataChannel(channel);
    } else {
      connection.addEventListener("datachannel", onDataChannel);
    }
  }

  #promoteToConnected(
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
