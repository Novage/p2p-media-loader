# WebTorrent Manager Specification

A high-level manager that orchestrates multiple `WebTorrentClient` instances connected to different tracker URLs for a single torrent (`infoHash`). It aggregates connections, manages peer uniqueness across multiple trackers, and efficiently pools underlying WebSocket connections.

## Overview

While a `WebTorrentClient` handles signaling for exactly **one** tracker, a real-world BitTorrent/WebTorrent swarm typically involves multiple trackers for redundancy and peer discovery. The `WebTorrentManager` is responsible for fanning out to these multiple trackers while presenting a single, unified interface to the higher layers (e.g., Swarm Manager).

**Key Responsibilities:**

1. **WebSocket Pooling**: Utilizes the `WebTorrentSocketPool` to share `WebSocketClient` connections. If multiple `WebTorrentManager` instances (for different `infoHash`es) use the same tracker URL, they will safely share the same underlying WebSocket.
2. **Aggregating Trackers**: Spins up and manages a `WebTorrentClient` for each configured tracker URL.
3. **Peer Uniqueness & Deduplication**: Ensures that the same remote peer is not connected multiple times, even if discovered across multiple trackers simultaneously.
4. **Peer Management**: Tracks active/negotiating peers, waits for Data Channels to open before emitting them, and provides a clean API to close individual peer connections.

---

## 1. Public API

### Constructor Configuration

```typescript
interface WebTorrentManagerConfig {
  infoHash: string; // 20-byte hex string representing the torrent
  peerId: string; // 20-byte hex string representing this client
  trackerUrls: string[]; // Array of WebSocket tracker URLs to connect to
  rtcConfig?: RTCConfiguration; // WebRTC STUN/TURN configuration
  channelConfig?: RTCDataChannelInit; // Data Channel configuration
  socketPool: WebTorrentSocketPool; // Shared socket pool
}
```

### Methods

- `start(): void`: Acquires sockets from the pool, instantiates the `WebTorrentClient`s, and calls `start()` on all of them.
- `destroy(): void`: Destroys all child `WebTorrentClient` instances, releases all sockets back to the pool, closes all active and connecting peer connections, dispatches `peerDisconnected` events for all connected peers, and clears all internal event listeners.
- `addEventListener<K extends keyof WebTorrentManagerEventMap>(eventName: K, listener: WebTorrentManagerEventMap[K]): void`: Registers an event listener.
- `removeEventListener<K extends keyof WebTorrentManagerEventMap>(eventName: K, listener: WebTorrentManagerEventMap[K]): void`: Removes a registered event listener.

### Events

The Manager aggregates events from all child clients and forwards/handles them.

- `peerConnected` (payload: `{ peerId: string, connection: RTCPeerConnection, channel: RTCDataChannel, trackerUrl: string, close: (error?: string) => void }`): Fired when a peer finishes WebRTC signaling on _any_ tracker and its Data Channel is successfully opened.
- `peerDisconnected` (payload: `{ peerId: string, reason: string, isError: boolean }`): Fired when a fully connected peer is closed, either due to an unexpected disconnect (e.g., network loss), manager destruction, or a manual call to the peer's `close` callback.
- `peerConnectFailed` (payload: `{ peerId: string, trackerUrl: string, error: string }`): Fired if a signaled peer fails to connect or its data channel fails to open.
- `warning` (payload: `{ trackerUrl: string, warning: string }`): Aggregated tracker warnings.
- `error` (payload: `{ trackerUrl: string, error: string }`): Aggregated tracker errors (both WebSocket level and WebTorrent level).

---

## 2. Architecture & Lifecycle

### Socket Pool Integration

For each URL in `trackerUrls`, the Manager calls `socketPool.acquire(url)`. This returns an object containing the `client` (a `WebSocketClient`) and a `release()` closure.
The Manager then constructs a `WebTorrentClient`, passing the acquired `WebSocketClient` into its configuration.
When the Manager is destroyed, it calls `client.destroy()` on the `WebTorrentClient`s, and then invokes the `release()` closure for each socket to return it to the pool.

### Peer Deduplication across Trackers

Because a user might be active on `wss://tracker1.com` and `wss://tracker2.com`, both trackers might send us the same remote `peer_id`.
To adhere to the Single Source of Truth principle, the `WebTorrentManager` avoids managing a separate set of known peers. Instead, it checks its existing collections of connected and connecting peers.
It passes a bound `#claimPeer` callback into every `WebTorrentClient` it creates:

```typescript
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
```

_Note: If the WebRTC signaling fails (e.g. ICE gathering timeout), the `WebTorrentClient` emits a `peerSignalingFailed` event, and the Manager automatically cleans up the `"signaling"` state to allow future reconnection attempts. If the connection fails after signaling, or the upper layer rejects the peer later, the upper layer must invoke the `close()` callback (provided in the `peerConnected` payload) to cleanly close the connection and remove it from the internal collections._

### Peer Connection Lifecycle

When a child `WebTorrentClient` emits a `peerSignaled` event, the Manager transitions the peer from the `"signaling"` state to the `"connecting"` state. It updates the entry in the `#connectingPeers` map with the actual `RTCPeerConnection` and starts listening to both `RTCPeerConnection` state events (`connectionstatechange`, `iceconnectionstatechange`) and the `RTCDataChannel` state.

#### Terminal States

For live video streaming, the manager treats certain transient or failing states as terminal:

- `failed`, `closed`, and `disconnected` states on either `connectionState` or `iceConnectionState` are treated as immediate terminal failure states. Dropping the peer immediately and reconnecting via a tracker is faster than waiting for a stale/disconnected connection to potentially recover.

A **15-second timeout** (`DATA_CHANNEL_TIMEOUT`) is applied to wait for the data channel to fully open.

- If the data channel successfully opens (or is already open) within the timeout, the Manager removes the peer from `#connectingPeers`, stores it in `#connectedPeers` (promoting it to `"connected"`), and dispatches the `peerConnected` event.
- If the connection times out, enters a terminal state, or the data channel fails/closes prematurely, the Manager cleans up, closes the connection, deletes the peer from `#connectingPeers`, and dispatches a `peerConnectFailed` event.

#### Connected Peer Lifecycle

Once connected, the Manager continues to monitor the peer for connection drops or errors. If the connection drops unexpectedly (e.g., the remote peer crashes or enters a terminal connection state like `disconnected`), the Manager:

1. Synchronously extracts the peer from the `#connectedPeers` map.
2. Closes the connection and performs necessary cleanup.
3. Dispatches a `peerDisconnected` event detailing the `reason` and whether `isError` is true.

#### Intentional Disconnection

To intentionally close a connection, the upper layer **must invoke the `close(error?: string)` callback** provided in the `peerConnected` event payload.

- Calling `close()` without arguments results in a standard disconnection with `reason: "Closed by consumer"` and `isError: false`.
- Calling `close(errorMessage)` results in a disconnection with `reason` set to the provided message and `isError: true`.

This follows the exact same cleanup flow: it synchronously extracts and deletes the peer from the `#connectedPeers` map, closes the connection, and dispatches a `peerDisconnected` event.

This guarantees a strict **1-to-1 parity** between `peerConnected` and `peerDisconnected` events, establishing the Manager as the definitive Single Source of Truth for peer lifecycles. It is impossible for `peerDisconnected` to double-fire, because both the automatic listeners and the manual `close()` callback synchronously extract and delete the peer from the internal map before dispatching the event.

### Event Aggregation

The Manager attaches event listeners to every `WebTorrentClient`. When a client emits a `warning` or `error`, the Manager wraps it with the specific `trackerUrl` and emits it upstream. This allows the Swarm Manager to log exactly which tracker is failing without needing to manage the clients directly.
