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
  infoHash: string; // 20-character ASCII string representing the torrent (derived from Base64 hash)
  peerId: string; // 20-byte string representing this client
  trackerUrls: string[]; // Array of WebSocket tracker URLs to connect to
  rtcConfig?: RTCConfiguration; // WebRTC STUN/TURN configuration
  channelConfig?: RTCDataChannelInit; // Data Channel configuration
  socketPool: WebTorrentSocketPool; // Shared socket pool
  offerTimeout?: number; // Time (in ms) to keep unanswered offers before destroying them. Default: 50000.
  offersCount?: number; // Maximum number of offers to generate per announce interval. Default: 5.
  connectionTimeout?: number; // Time (in ms) to wait for the data channel to open. Default: 15000.
}
```

### Methods

- `start(): void`: Acquires sockets from the pool, instantiates the `WebTorrentClient`s, and calls `start()` on all of them.
- `destroy(): void`: Destroys all child `WebTorrentClient` instances, releases all sockets back to the pool, closes all active and connecting peer connections, dispatches `peerDisconnected` events for all connected peers, and clears all internal event listeners.
- `addEventListener<K extends keyof WebTorrentManagerEventMap>(eventName: K, listener: WebTorrentManagerEventMap[K]): void`: Registers an event listener.
- `removeEventListener<K extends keyof WebTorrentManagerEventMap>(eventName: K, listener: WebTorrentManagerEventMap[K]): void`: Removes a registered event listener.

### Events

The Manager aggregates events from all child clients and forwards/handles them.

- `peerConnected` (payload: `{ peerId: string, connection: RTCPeerConnection, channel: RTCDataChannel, trackerUrl: string, close: (error?: PeerError) => void }`): Fired when a peer finishes WebRTC signaling on _any_ tracker and its Data Channel is successfully opened.
- `peerDisconnected` (payload: `{ peerId: string, trackerUrl: string } & ({ error: PeerError } | { disconnectReason: string })`): Fired when a fully connected peer is closed, either due to an unexpected disconnect (e.g., network loss), manager destruction, or a manual call to the peer's `close` callback. The payload strictly separates expected closures (`disconnectReason`) from faults (`error`).
- `peerConnectFailed` (payload: `{ peerId: string, trackerUrl: string, error: PeerConnectError }`): Fired if a signaled peer fails to connect or its data channel fails to open.
- `warning` (payload: `{ trackerUrl: string, warning: TrackerWarning }`): Aggregated tracker warnings.
- `error` (payload: `{ trackerUrl: string, error: TrackerError }`): Aggregated tracker errors (both WebSocket level and WebTorrent level).

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
```

_Note: If the WebRTC connection fails (e.g. ICE gathering timeout or data channel timeout), the `WebTorrentClient` emits a `peerConnectFailed` event, and the Manager automatically deletes the peer from `#connectingPeers` to allow future reconnection attempts. If the connection fails after being fully established, or the upper layer rejects the peer later, the upper layer must invoke the `close()` callback (provided in the `peerConnected` payload) to cleanly close the connection and remove it from the internal collections._

### Peer Connection Lifecycle

The `WebTorrentClient` fully encapsulates the WebRTC negotiation and data channel establishment.

- If a peer successfully completes WebRTC signaling and its Data Channel opens, the client emits a `peerConnected` event. The Manager removes the peer from `#connectingPeers`, stores it in `#connectedPeers`, and dispatches its own `peerConnected` event upstream.
- If a peer fails to connect (either during signaling or while waiting for the data channel), the client emits a `peerConnectFailed` event. The Manager removes the peer from `#connectingPeers` and forwards the `peerConnectFailed` event upstream.

#### Connected Peer Lifecycle

Once connected, the Manager continues to monitor the peer for connection drops or errors. If the connection drops unexpectedly (e.g., the remote peer crashes or enters a terminal connection state like `disconnected`), the Manager:

1. Synchronously extracts the peer from the `#connectedPeers` map.
2. Closes the connection and performs necessary cleanup.
3. Dispatches a `peerDisconnected` event carrying either a `disconnectReason` (for expected disconnects) or an `error: PeerError` (for unexpected faults/failures).

#### Intentional Disconnection

To intentionally close a connection, the upper layer **must invoke the `close(error?: PeerError)` callback** provided in the `peerConnected` event payload.

- Calling `close()` without arguments results in a standard disconnection with `disconnectReason: "Closed by consumer"`.
- Calling `close(error)` results in a disconnection with the provided `error: PeerError`.

This follows the exact same cleanup flow: it synchronously extracts and deletes the peer from the `#connectedPeers` map, closes the connection, and dispatches a `peerDisconnected` event.

This guarantees a strict **1-to-1 parity** between `peerConnected` and `peerDisconnected` events, establishing the Manager as the definitive Single Source of Truth for peer lifecycles. It is impossible for `peerDisconnected` to double-fire, because both the automatic listeners and the manual `close()` callback synchronously extract and delete the peer from the internal map before dispatching the event.

### Event Aggregation

The Manager attaches event listeners to every `WebTorrentClient`. When a client emits a `warning` or `error`, the Manager wraps it with the specific `trackerUrl` and emits it upstream. This allows the Swarm Manager to log exactly which tracker is failing without needing to manage the clients directly.
