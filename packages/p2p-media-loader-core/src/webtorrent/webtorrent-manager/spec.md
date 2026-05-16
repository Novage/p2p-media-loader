# WebTorrent Manager Specification

A high-level manager that orchestrates multiple `WebTorrentClient` instances connected to different tracker URLs for a single torrent (`infoHash`). It aggregates connections, manages peer uniqueness across multiple trackers, and efficiently pools underlying WebSocket connections.

## Overview

While a `WebTorrentClient` handles signaling for exactly **one** tracker, a real-world BitTorrent/WebTorrent swarm typically involves multiple trackers for redundancy and peer discovery. The `WebTorrentManager` is responsible for fanning out to these multiple trackers while presenting a single, unified interface to the higher layers (e.g., Swarm Manager).

**Key Responsibilities:**
1. **WebSocket Pooling**: Utilizes the `WebTorrentSocketPool` to share `WebSocketClient` connections. If multiple `WebTorrentManager` instances (for different `infoHash`es) use the same tracker URL, they will safely share the same underlying WebSocket.
2. **Aggregating Trackers**: Spins up and manages a `WebTorrentClient` for each configured tracker URL.
3. **Peer Uniqueness & Deduplication**: Ensures that the same remote peer is not connected multiple times, even if discovered across multiple trackers simultaneously.
4. **Peer Management**: Tracks active/negotiating peers, waits for Data Channels to open before emitting them, allows the upper layer to query connected peers, and provides an API to force-close a peer connection.

---

## 1. Public API

### Constructor Configuration

```typescript
interface WebTorrentManagerConfig {
  infoHash: string;             // 20-byte hex string representing the torrent
  peerId: string;               // 20-byte hex string representing this client
  trackerUrls: string[];        // Array of WebSocket tracker URLs to connect to
  rtcConfig?: RTCConfiguration; // WebRTC STUN/TURN configuration
  channelConfig?: RTCDataChannelInit; // Data Channel configuration
  
  // Optional shared socket pool. If not provided, the manager can instantiate its own 
  // or rely on a global pool passed down from the engine.
  socketPool: WebTorrentSocketPool; 
}
```

### Methods

- `start(): void`: Acquires sockets from the pool, instantiates the `WebTorrentClient`s, and calls `start()` on all of them.
- `destroy(): void`: Destroys all child `WebTorrentClient` instances, releases all sockets back to the pool, and clears the known peers list.

### Events

The Manager aggregates events from all child clients and forwards them.

- `peerConnected` (payload: `{ peerId: string, connection: RTCPeerConnection, channel: RTCDataChannel, trackerUrl: string, close: (error?: string) => void }`): Fired when a peer finishes WebRTC signaling on *any* tracker and its Data Channel is successfully opened.
- `peerDisconnected` (payload: `{ peerId: string, error?: string }`): Fired when a fully connected peer is closed, either due to an unexpected disconnect (e.g. network loss) or a manual call to `peer.close()`.
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
It passes a bound `claimPeer` callback into every `WebTorrentClient` it creates:

```typescript
const claimPeer = (remotePeerId: string, timeout: number) => {
  if (this.connectingPeers.has(remotePeerId) || this.connectedPeers.has(remotePeerId)) {
    return false; // Already negotiating or connected via another tracker
  }
  
  // Eagerly reserve the peer ID in the connecting collection to prevent 
  // duplicate concurrent signaling from other trackers.
  // A timeout is applied to release the lock if signaling fails or stalls.
  const timeoutId = setTimeout(() => {
    const peer = this.connectingPeers.get(remotePeerId);
    if (peer?.status === "signaling") {
      this.connectingPeers.delete(remotePeerId);
    }
  }, timeout);

  this.connectingPeers.set(remotePeerId, { status: "signaling", timeoutId }); 
  return true;
}
```
*Note: If the WebRTC connection fails or the upper layer rejects the peer later, the upper layer must call `peer.close()` to remove it from the collections, allowing future reconnection attempts.*

### Peer Connection Lifecycle
When a child `WebTorrentClient` emits a `peerSignaled` event, the Manager updates the existing reserved entry in the `connectingPeers` collection with the actual `RTCPeerConnection` and listens to the `RTCDataChannel` state changes. 
A **15-second timeout** is applied to wait for the data channel to fully open.
If the data channel successfully opens within the timeout, the Manager removes the peer from `connectingPeers`, stores it in `connectedPeers`, and emits a `peerConnected` event with the established channel. 
If the connection times out, fails, or the data channel fails to open, the Manager cleans up the connection, removes it from `connectingPeers`, and emits a `peerConnectFailed` event for outside logging.

Once connected, the Manager continues to listen to lifecycle events (`connectionstatechange`, `iceconnectionstatechange`, and data channel `close`/`error`). If the connection drops unexpectedly (e.g. the remote peer crashes), the Manager synchronously extracts the peer from its internal map, closes the connection, and emits a `peerDisconnected` event. 

To intentionally close a connection, the upper layer **must call `peer.close()`** (provided in the `peerConnected` payload) instead of `connection.close()`. This follows the exact same cleanup flow: it synchronously removes the peer from the internal map, closes the connection, and emits `peerDisconnected`. 

This guarantees a strict **1-to-1 parity** between `peerConnected` and `peerDisconnected` events, establishing the Manager as the definitive Single Source of Truth for peer lifecycles. It is impossible for `peerDisconnected` to double-fire, because both the automatic listener and the manual `peer.close()` method synchronously extract and delete the peer from the internal map before firing the event.

### Event Aggregation
The Manager attaches event listeners to every `WebTorrentClient`. When a client emits a `warning` or `error`, the Manager wraps it with the specific `trackerUrl` and emits it upstream. This allows the Swarm Manager to log exactly which tracker is failing without needing to manage the clients directly.
