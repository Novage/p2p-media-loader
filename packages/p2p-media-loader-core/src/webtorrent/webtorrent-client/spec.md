# WebTorrent Client Specification

A lightweight WebTorrent signaling client that handles the WebSocket tracker protocol and establishes WebRTC connections.

## Overview

The `WebTorrentClient` acts as a signaling layer using the `WebSocketClient` under the hood. It connects to a single standard WebTorrent tracker, exchanges SDP offers and answers, manages ICE candidate gathering, and returns negotiating (not yet connected) `RTCPeerConnection` and `RTCDataChannel` instances to consumers.

**Key Design Decisions:**

1. **Strictly Browser Implementation**: Uses native browser `RTCPeerConnection` APIs without Node.js polyfills or dependencies.
2. **Single Responsibility (SRP)**: Each instance manages exactly **one** WebSocket connection to a **single** tracker.
3. **Early Deduplication**: To prevent duplicate peer connections across multiple tracker clients, it accepts a `claimPeer` callback to attempt to lock a `peer_id` for signaling, successfully deduplicating at the earliest possible stage.
4. **Negotiate and Hand-Off**: The client handles WebRTC SDP signaling. The exact moment signaling finishes, it emits the negotiating objects to a higher layer (e.g., Swarm Manager) which takes ownership, waits for the connection to open, and handles the BitTorrent wire protocol.
5. **Data Channel Configuration**: Matches the default behavior of the `bittorrent-tracker` (and `simple-peer`) npm packages, which create reliable, ordered Data Channels (empty `RTCDataChannelInit` config) unless explicitly overridden.
6. **Optional WebSocket Pooling**: The `WebTorrentClient` does not create its own WebSocket connection. Instead, it accepts an injected `WebSocketClient` in its constructor. This allows higher layers to implement connection pooling (sharing a single WebSocket across multiple torrents to the same tracker) or manage the socket lifecycle independently.

---

## 1. Public API

### Constructor Configuration

```typescript
interface WebTorrentClientConfig {
  wsClient: WebSocketClient; // The underlying WebSocket client
  infoHash: string; // 20-byte hex string representing the torrent
  peerId: string; // 20-byte hex string representing this client
  rtcConfig?: RTCConfiguration; // Optional custom STUN/TURN server configuration
  channelConfig?: RTCDataChannelInit; // Optional Data Channel overrides
  offerTimeout?: number; // Time (in ms) to keep unanswered offers before destroying them. Default: 50000 (50s).
  offersCount?: number; // Maximum number of offers to generate per announce interval. Default: 5.

  // Callback invoked when a peer_id is discovered via an offer or answer.
  // Attempts to claim the peer for the specified timeout duration.
  // Return true to accept and connect, false if the peer is already claimed/connected.
  claimPeer?: (peerId: string, timeout: number) => boolean;

  // Callback invoked before every announce to determine if new offers should be generated.
  // Return false to stop generating offers (numwant: 0), while still answering incoming offers.
  shouldGenerateOffers?: () => boolean;
}
```

### Methods

- `start(): void`: Begins the `announce` loop if the injected `WebSocketClient` is already connected, or waits for it to connect. It does not call `connect()` on the injected client.
- `destroy(): void`: Complete teardown. Sends a final `event: "stopped"` announce to the tracker (if connected), clears all pending offers and timers, removes all event listeners, and disposes the abort controllers. Does NOT dispose the `WebSocketClient` as it may be pooled.
- `addEventListener<K extends keyof WebTorrentClientEventMap>(eventName: K, listener: WebTorrentClientEventMap[K]): void`: Registers an event listener.
- `removeEventListener<K extends keyof WebTorrentClientEventMap>(eventName: K, listener: WebTorrentClientEventMap[K]): void`: Removes a registered event listener.

### Events

- `peerSignaled` (payload: `{ peerId: string, connection: RTCPeerConnection, channel?: RTCDataChannel }`): Fired the exact moment WebRTC SDP signaling is complete. The Swarm Manager takes immediate ownership. Note: `channel` is only provided if we initiated the connection. If we received the offer, the Swarm Manager must listen for the `ondatachannel` event on the connection.
- `peerSignalingFailed` (payload: `{ peerId: string, error: string }`): Fired if WebRTC SDP negotiation fails after a peer has been claimed (e.g., ICE gathering timeout or SDP application error), allowing the manager to release the claim.
- `warning` (payload: `string`): Fired if the tracker returns a warning.
- `error` (payload: `string`): Fired if the tracker returns an error, or if the underlying WebSocket encounters a failure.

---

## 2. Architecture & Lifecycle

### Early Deduplication (The `claimPeer` Hook)

Because the higher layer (e.g., Peer Manager) may spin up multiple `WebTorrentClient` instances for different public trackers, the same remote peer will likely be discovered multiple times. The client uses the injected `claimPeer` to deduplicate aggressively:

1. **When Receiving an Offer:** The tracker JSON includes the remote `peer_id`. The client immediately calls `claimPeer(peer_id, offerTimeout)`. If it returns `false`, the client **ignores the JSON message entirely** and does not create an `RTCPeerConnection`.
2. **When Receiving an Answer:** The tracker forwards an `answer` to a pending offer we sent. The JSON includes the remote `peer_id`. The client calls `claimPeer(peer_id, offerTimeout)`. If it returns `false`, the client **immediately closes** the pending `RTCPeerConnection` and discards the answer.

### Message Validation

Before processing offers and answers, the client validates incoming messages:

1. **`info_hash` Check**: If the message includes an `info_hash` field that does not match the client's configured `infoHash`, the entire message is silently discarded. This prevents cross-talk when WebSocket connections are shared across multiple torrents.
2. **Self-Peer Check**: If the message's `peer_id` matches our own `peerId`, it is silently discarded. This prevents the client from attempting to connect to itself.
3. **Runtime Type Checks**: All fields from the untrusted JSON are validated with `typeof` checks before use. No unsafe `as` casts are applied to the raw parsed data.

### WebTorrent Tracker Protocol (Detailed Message Flow)

The client communicates via JSON messages over the `WebSocketClient`. Below is the exact format of the payloads exchanged between the client and the tracker.

#### 1. Announcing & Sending Offers (Client -> Tracker)

Periodically (based on the tracker's `interval`), or when first connecting, the client sends an `announce` action. If the client wants to initiate connections (and `shouldGenerateOffers` returns `true`), it gathers ICE candidates and includes an array of `offers`. If `shouldGenerateOffers` returns `false`, it sends `"numwant": 0` and an empty `"offers": []` array to maintain presence in the swarm without incurring offer-generation overhead.

```json
{
  "action": "announce",
  "info_hash": "<20-character-binary-string>",
  "peer_id": "<20-character-binary-string>",
  "numwant": 5,
  "uploaded": 0,
  "downloaded": 0,
  "event": "started", // "started", "completed", "stopped", or omitted
  "offers": [
    {
      "offer": { "type": "offer", "sdp": "v=0\r\no=..." },
      "offer_id": "<20-char-alphanumeric>"
    }
  ],
  "trackerid": "<tracker-assigned-id>" // included if previously received from tracker
}
```

#### 2. Tracker Announce Response (Tracker -> Client)

The tracker replies to the announce with swarm statistics. Upon receiving this message, the client reads the `interval` property and schedules the next announce using an internal `setInterval`. To prevent unnecessarily resetting the announce loop, the interval timer is only cleared and restarted if the tracker explicitly changes the `interval` value.

```json
{
  "action": "announce",
  "interval": 120,
  "info_hash": "<20-character-binary-string>",
  "complete": 5,
  "incomplete": 3,
  "tracker id": "<optional-tracker-assigned-id>" // stored and echoed back in subsequent announces as "trackerid"
}
```

#### 3. Tracker Error & Warning Responses (Tracker -> Client)

Trackers may respond with errors (which usually mean the announce failed entirely) or warnings. They follow this specific format:

```json
{
  "failure reason": "Invalid info_hash"
}
```

```json
{
  "warning message": "Rate limited, please slow down"
}
```

#### 4. Receiving an Offer (Tracker -> Client)

When another peer generates an offer and the tracker routes it to us, it arrives in this format:

```json
{
  "action": "announce",
  "info_hash": "<20-character-binary-string>",
  "peer_id": "<remote-peer-id-binary>",
  "offer_id": "<remote-offer-id>",
  "offer": { "type": "offer", "sdp": "v=0\r\no=..." }
}
```

#### 5. Sending an Answer (Client -> Tracker)

When the client accepts an incoming offer, it generates an answer and sends it back to the tracker. Note the inclusion of `to_peer_id` to tell the tracker exactly who should receive it.

```json
{
  "action": "announce",
  "info_hash": "<20-character-binary-string>",
  "peer_id": "<my-peer-id-binary>",
  "to_peer_id": "<remote-peer-id-binary>",
  "offer_id": "<remote-offer-id>",
  "answer": { "type": "answer", "sdp": "v=0\r\no=..." }
}
```

#### 6. Receiving an Answer (Tracker -> Client)

When a remote peer accepts an offer we previously sent, the tracker routes their answer back to us.

```json
{
  "action": "announce",
  "info_hash": "<20-character-binary-string>",
  "peer_id": "<remote-peer-id-binary>",
  "offer_id": "<our-original-offer-id>",
  "answer": { "type": "answer", "sdp": "v=0\r\no=..." }
}
```

### WebRTC Connection Flow (Offers & Answers)

Standard WebTorrent signaling **does not use Trickle ICE**. All ICE candidates must be gathered and bundled into a single SDP before sending it to the tracker.

#### ICE Gathering Timeout

ICE gathering can stall indefinitely if STUN/TURN servers are unreachable or the network is offline. To prevent this, the client enforces a **5-second timeout** on ICE gathering (matching `simple-peer`'s `ICECOMPLETE_TIMEOUT`). If gathering does not complete within 5 seconds, the promise is rejected and the caller closes the `RTCPeerConnection`. After any async ICE wait, the client also checks the `destroyed` flag to avoid acting on a torn-down instance.

#### Initiating Connections (Sending Offers)

When generating offers, we do **not** know which peer will receive them. All offers are generated **in parallel** (via `Promise.allSettled`) to avoid sequential ICE gathering latency — reducing worst-case announce delay from `offersCount × ICE_TIMEOUT` to a single `ICE_TIMEOUT`.

1. For each offer slot, the client concurrently creates a new `RTCPeerConnection` and `RTCDataChannel`.
2. It creates an SDP offer, waits for ICE gathering, and bundles the SDP.
3. It generates a random alphanumeric `offer_id` (e.g., 20 characters) to ensure safe string handling during JSON serialization/deserialization.
4. It stores the pending `RTCPeerConnection` in an internal Map keyed by `offer_id` (e.g., `pendingOffers.set(offer_id, pc)`).
5. It sets a timeout (`offerTimeout`, default 50s). If no answer is received before the timeout, the `RTCPeerConnection` is closed and removed from the Map to prevent memory leaks.
6. Once all parallel offer tasks settle, the successfully created offers are collected and attached to a single tracker `announce` payload. Failed offers are discarded (with an error event dispatched). (The Swarm Manager is **not** involved yet, because we don't have a `peer_id`).

#### Receiving Offers

1. The tracker sends an incoming `offer` originating from another peer. This payload **does** contain their `peer_id`.
2. **Deduplication Check**: Call `claimPeer(peer_id, offerTimeout)`. Abort if `false`.
3. The client creates a new `RTCPeerConnection` and calls `setRemoteDescription`.
4. It creates an SDP answer, waits for ICE gathering, and sends it back to the tracker.
5. **Immediate Hand-Off**: Signaling is complete. The client emits the `peerSignaled` event with `{ peerId, connection }` (no `channel` because it hasn't been established yet). The client forgets about this connection.

#### Receiving Answers

1. The tracker forwards an `answer` SDP to an `offer_id` we previously sent. This payload now reveals the remote `peer_id`.
2. **Deduplication Check**: We finally know who answered! Call `claimPeer(peer_id, offerTimeout)`.
3. If `claimPeer` returns `false` (we are already connected to them via another route), we look up the pending `RTCPeerConnection` by `offer_id`, immediately call `.close()`, clear the timeout, delete it, and abort.
4. If `true`, the client applies `setRemoteDescription(answer)` to the pending connection and clears the timeout.
5. **Immediate Hand-Off**: Signaling is complete. The client removes the connection from `pendingOffers` and emits the `peerSignaled` event with `{ peerId, connection, channel }`.

### Hand-Off (Strict SRP)

To maintain strict Single Responsibility, the `WebTorrentClient`'s job ends the exact millisecond the SDP negotiation finishes. It does **not** wait for the Data Channel to open, nor does it monitor ICE connection states. It emits the `peerSignaled` event and drops its internal reference.

The upper Peer Manager receives the negotiating objects and takes full responsibility for:

1. If `channel` is provided (initiator), listening to `channel.onopen`.
2. If `channel` is undefined (receiver), listening to `connection.ondatachannel` and then its `onopen` event.
3. Listening to `connection.oniceconnectionstatechange` to detect failures.
4. Setting timeouts for the connection attempt.
5. Cleaning up its internal `connectingPeers` set if it fails.
