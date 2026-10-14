# WebTorrent Client Specification

A lightweight WebTorrent signaling client that handles the WebSocket tracker protocol and establishes WebRTC connections.

## Overview

The `WebTorrentClient` acts as a signaling layer using the `WebSocketClient` under the hood. It connects to a single standard WebTorrent tracker, exchanges SDP offers and answers, manages ICE candidate gathering, and returns fully connected `RTCPeerConnection` and `RTCDataChannel` instances to consumers.

**Key Design Decisions:**

1. **Strictly Browser Implementation**: Uses native browser `RTCPeerConnection` APIs without Node.js polyfills or dependencies. Designed to support older browsers (down to Chrome 49+, legacy Safari, and older Smart TVs) by falling back to legacy callback-based (non-Promise) WebRTC signatures on engines where native WebRTC Promises are missing or incomplete, avoiding `RTCPeerConnection.connectionState`, and using a `queueMicrotask` fallback. It also utilizes a custom `SafeAbortController` polyfill to guarantee safe and robust asynchronous request cancellation in environments lacking native `AbortController` support.
2. **Single Responsibility (SRP)**: Each instance manages exactly **one** WebSocket connection to a **single** tracker.
3. **Early Deduplication**: To prevent duplicate peer connections across multiple tracker clients, it accepts a `claimPeer` callback to attempt to lock a `peer_id` for signaling, successfully deduplicating at the earliest possible stage.
4. **Negotiate and Connect**: The client handles WebRTC SDP signaling and waits for the data channel to open. Once fully connected, it emits the connected objects to a higher layer (e.g., Swarm Manager) which takes ownership and handles the BitTorrent wire protocol.
5. **Data Channel Configuration**: Matches the default behavior of the `bittorrent-tracker` (and `simple-peer`) npm packages, which create reliable, ordered Data Channels (empty `RTCDataChannelInit` config) unless explicitly overridden.
6. **Optional WebSocket Pooling**: The `WebTorrentClient` does not create its own WebSocket connection. Instead, it accepts an injected `WebSocketClient` in its constructor. This allows higher layers to implement connection pooling (sharing a single WebSocket across multiple torrents to the same tracker) or manage the socket lifecycle independently.

---

## 1. Public API

### Constructor Configuration

```typescript
interface WebTorrentClientConfig {
  wsClient: WebSocketClient; // The underlying WebSocket client
  infoHash: string; // 20-character ASCII string representing the torrent (derived from Base64 hash)
  peerId: string; // 20-byte string representing this client
  rtcConfig?: RTCConfiguration; // Optional custom STUN/TURN server configuration
  channelConfig?: RTCDataChannelInit; // Optional Data Channel overrides
  offerTimeout?: number; // Time (in ms) to keep unanswered offers before destroying them. Default: 50000 (50s).
  offersCount?: number; // Maximum number of offers to generate per announce interval. Default: 5.
  connectionTimeout?: number; // Time (in ms) to wait for the data channel to open. The answerer waits 5 s more (see "Receiving Offers"). Default: 15000 (15s).

  // Callback invoked when a peer_id is discovered via an offer or answer.
  // Attempts to claim the peer to prevent duplicate connections.
  // Return true to accept and connect, false if the peer is already claimed/connected.
  // `handshake` says whether we answer the peer's offer or it answered ours,
  // and can cancel the exchange; see "Early Deduplication".
  claimPeer?: (peerId: string, handshake: PeerHandshake) => boolean;

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

- `peerConnected` (payload: `{ peerId: string, connection: RTCPeerConnection, channel: RTCDataChannel, handshake: PeerHandshake }`): Fired when the peer finishes WebRTC signaling and its Data Channel is successfully opened. The Swarm Manager takes immediate ownership.
- `peerConnectFailed` (payload: `{ peerId: string, error: PeerConnectError, handshake: PeerHandshake }`): Fired if WebRTC SDP negotiation fails, the data channel fails to open, or the handshake is cancelled, after a peer has been claimed (e.g., ICE gathering timeout or connection timeout), allowing the manager to release the claim.

Both carry the `handshake` object that was passed to `claimPeer`, so the claimant can tell which of its exchanges with the peer ended.

- `warning` (payload: `string`): Fired if the tracker returns a warning, or if the client encounters a local recoverable issue during signaling or offer/answer creation.
- `error` (payload: `string`): Fired if the tracker returns an error, or if the underlying WebSocket encounters a failure.

---

## 2. Architecture & Lifecycle

### Early Deduplication (The `claimPeer` Hook)

Because the higher layer (e.g., Peer Manager) may spin up multiple `WebTorrentClient` instances for different public trackers, the same remote peer will likely be discovered multiple times. The client uses the injected `claimPeer` to deduplicate aggressively:

1. **When Receiving an Offer:** The tracker JSON includes the remote `peer_id`. The client immediately calls `claimPeer(peer_id)`. If it returns `false`, the client **ignores the JSON message entirely** and does not create an `RTCPeerConnection`.
2. **When Receiving an Answer:** The tracker forwards an `answer` to a pending offer we sent. The JSON includes the remote `peer_id`. The client calls `claimPeer(peer_id)`. If it returns `false`, the client **immediately closes** the pending `RTCPeerConnection` and discards the answer.

Each call passes a `PeerHandshake`: `{ role: "answerer" }` for an offer we answer, `{ role: "offerer" }` for an answer to our offer, and a `cancel()` that abandons the exchange. A cancelled exchange closes its `RTCPeerConnection` and ends with `peerConnectFailed`, like one that failed. The manager cancels one only to settle glare: two peers that answer each other's offers at once (see the WebTorrent Manager spec, "Glare").

### Message Validation

Before processing offers and answers, the client validates incoming messages:

1. **`info_hash` Check**: If the message includes an `info_hash` field that does not match the client's configured `infoHash`, the entire message is silently discarded. This prevents cross-talk when WebSocket connections are shared across multiple torrents.
2. **Self-Peer Check**: If the message's `peer_id` matches our own `peerId`, it is silently discarded. This prevents the client from attempting to connect to itself.
3. **Runtime Type Checks**: All fields from the untrusted JSON are validated with `typeof` checks before use. No unsafe `as` casts are applied to the raw parsed data.

### WebTorrent Tracker Protocol (Detailed Message Flow)

The client communicates via JSON messages over the `WebSocketClient`. Below is the exact format of the payloads exchanged between the client and the tracker.

#### 1. Announcing & Sending Offers (Client -> Tracker)

Periodically (based on the tracker's `interval`), or when first connecting, the client sends an `announce` action. If the client wants to initiate connections (and `shouldGenerateOffers` returns `true`), it gathers ICE candidates and includes an array of `offers`, as many as the swarm calls for (below); the first announce of a connection carries none. If `shouldGenerateOffers` returns `false`, it sends `"numwant": 0` and an empty `"offers": []` array to maintain presence in the swarm without incurring offer-generation overhead.

The number of offers follows the swarm. The tracker gives each offer to a different peer and drops the rest. An offer past the other peers only costs an `RTCPeerConnection` and its ICE gathering. Each announce reply carries `complete` and `incomplete`, which count this peer too, so the other peers are their sum less one. The client takes a count only from a reply with this swarm's `info_hash`: on a shared socket, a message without it can belong to another swarm. The peers already connected count as well, since the tracker chooses the receivers.

- **The first announce of a connection** (`event: "started"`) carries no offers. When its reply arrives, the client announces again with one offer for each other peer, up to `offersCount`. A peer alone sends nothing more: a peer that joins later offers to it. The count may not answer this client's own announce. On a shared socket, bittorrent-tracker first answers the `stopped` of a client that just left the same swarm, and that count does not include this peer. So a peer counted alone that gets a reply with other peers before its next announce sends one offer for each of them then. An offer from a peer ends this wait: that peer has found this one, and some trackers reply to the answer with a count that includes it. If the reply has no count, the client offers `offersCount` at once; if no reply arrives within 2 s, it offers `offersCount` then. A lost socket starts this over: a new socket may reach a tracker that no longer counts this peer. An announce that still gathers its offers when the socket is lost drops them and sends nothing. So it cannot go out on the next socket before that socket's count. `TrackerAnnounce:socket-lost` counts these announces.
- **A periodic announce** sends one offer for each other peer of the last count, up to `offersCount`, and at least one. The count is up to an interval old, and the one offer reaches a peer that joined since and whose own offers failed to connect.

Two peers that join an empty swarm through one tracker at the same moment do not both offer. The tracker counts one of them first, and that one sends no offers. Through different trackers the order can differ, so both can offer. In a swarm that has other peers, both get a count above one and both offer, so the tracker can give the offer of each to the other. In these cases glare (see the WebTorrent Manager spec) can occur.

A peer at its peer limit sends no second announce, whatever the count. Its periodic announces offer once it is below its limit. The counters `TrackerAnnounce:alone`, `:sized`, `:no-count` and `:peer-limit` record the result of each first announce. `TrackerAnnounce:alone-recounted` counts each alone count that a later count corrected. `TrackerAnnounce:offers-capped` counts each announce, first or periodic, that the count limited to fewer than `offersCount`.

```json
{
  "action": "announce",
  "info_hash": "<20-character-binary-string>",
  "peer_id": "<20-character-binary-string>",
  "numwant": 5,
  "uploaded": 1048576, // bytes sent to peers in this swarm since joining it
  "downloaded": 3145728, // bytes of this swarm's segments delivered, over HTTP and P2P
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

`uploaded` and `downloaded` are the swarm's totals since this peer joined it, read at each announce from `transferredBytes`; the `stopped` announce carries the final ones. The P2P loader counts complete transfers only: a segment when it is delivered, whether it came over HTTP, over P2P, or partly over each, and an upload when its last byte is sent, counting only the bytes sent. Peers exchange segments only inside one swarm, so every byte one peer uploads is a byte another peer downloads over P2P. A tracker can therefore compute, for each `info_hash`:

- P2P bytes: the sum of `uploaded`;
- all bytes: the sum of `downloaded`;
- HTTP bytes: the difference, and the P2P share as P2P bytes over all bytes.

The totals restart at 0 when a peer joins a swarm again (a new `started`). A tracker that sums them adds, for each peer, the growth since that peer's previous announce.

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

ICE gathering can stall indefinitely if STUN/TURN servers are unreachable or the network is offline. To prevent this, the client enforces a **5-second timeout** on ICE gathering (matching `simple-peer`'s `ICECOMPLETE_TIMEOUT`). If gathering does not complete within 5 seconds, the promise is resolved to use whatever candidates have been gathered so far. After any async ICE wait, the client also checks the `destroyed` flag to avoid acting on a torn-down instance.

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
2. **Deduplication Check**: Call `claimPeer(peer_id, { role: "answerer", cancel })`. Abort if `false`.
3. The client creates a new `RTCPeerConnection` and calls `setRemoteDescription`.
4. It creates an SDP answer, waits for ICE gathering, and sends it back to the tracker.
5. **Wait for Connection**: Signaling is complete. The client waits for the data channel to open, then emits the `peerConnected` event with `{ peerId, connection, channel }`. The client then hands off ownership of the connection. The answerer waits `connectionTimeout` plus 5 s. Its wait starts when it sends the answer, and the tracker must then deliver the answer to the offerer. The offerer's wait starts only when the answer arrives. Without the 5 s, a slow tracker makes the answerer give up first, while the connection is still forming.

#### Receiving Answers

1. The tracker forwards an `answer` SDP to an `offer_id` we previously sent. This payload now reveals the remote `peer_id`.
2. **Deduplication Check**: We finally know who answered! Call `claimPeer(peer_id, { role: "offerer", cancel })`.
3. If `claimPeer` returns `false` (we are already connected to them via another route), we look up the pending `RTCPeerConnection` by `offer_id`, immediately call `.close()`, clear the timeout, delete it, and abort.
4. If `true`, the client applies `setRemoteDescription(answer)` to the pending connection and clears the timeout.
5. **Wait for Connection**: Signaling is complete. The client removes the connection from `pendingOffers`, waits for the data channel to open, and emits the `peerConnected` event with `{ peerId, connection, channel }`.

### Hand-Off

The `WebTorrentClient`'s job ends the exact millisecond the data channel is successfully opened. It emits the `peerConnected` event and drops its internal reference.

The upper Peer Manager receives the connected objects and takes full responsibility for:

1. Listening to `channel.onclose` and `connection.oniceconnectionstatechange` to detect failures/drops.
2. Handling the BitTorrent wire protocol messages over the data channel.
3. Cleaning up its internal state if the connection closes.
