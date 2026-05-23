# WebSocket Client Specification

A robust, universal WebSocket client. It automatically maintains the connection and reconnects using Exponential Backoff and Jitter.

## 1. Public API

### Constructor Configuration

```typescript
interface WebSocketClientConfig {
  url: string; // The WebSocket endpoint to connect to
  initialDelay?: number; // The initial wait time before the first reconnection attempt. Default: 1000 (1s)
  maxDelay?: number; // The maximum wait time between reconnection attempts. Default: 30000 (30s)
  jitterMultiplier?: number; // A multiplier used to add randomness to the delay. Default: 0.2
}
```

### Properties

- `state` (`'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'disposed'`): Read-only getter returning the current state of the client.

### Methods

- `connect(): void`: Initiates the WebSocket connection.
- `send(data: string | ArrayBuffer | Blob | ArrayBufferView): void`: Sends data over the WebSocket. Must support binary data. Throws an error if called when not connected.
- `dispose(): void`: Completely tears down the client, clears callbacks, stops all timers, closes the socket, clears event listeners, and prevents future automatic reconnections.
- `addEventListener<K extends keyof WebSocketClientEventMap>(eventName: K, listener: WebSocketClientEventMap[K]): void`: Registers an event listener.
- `removeEventListener<K extends keyof WebSocketClientEventMap>(eventName: K, listener: WebSocketClientEventMap[K]): void`: Removes a registered event listener.

### Events

The client implements an `EventTarget` system emitting the following lifecycle events:

- `connected` (payload: `void`): Fired when the WebSocket connection is successfully established.
- `disconnected` (payload: `void`): Fired when the connection is lost (or deliberately closed).
- `reconnecting` (payload: `void`): Fired when a reconnection attempt is scheduled.
- `error` (payload: `Event`): Fired when a WebSocket error occurs.
- `message` (payload: `ArrayBuffer | string`): Fired when a message is received from the server.

---

## 2. Architectural Behaviors

1. **Exponential Backoff & Jitter**: Reconnection delays increase exponentially with a random jitter factor to avoid overwhelming the server upon restart. The delay is calculated as:
   `baseDelay = min(initialDelay * 2^backoffCount, maxDelay)`
   `jitter = baseDelay * jitterMultiplier`
   `delay = max(0, baseDelay + random(-jitter, jitter))`
2. **Binary Compatibility**: Configures `binaryType = 'arraybuffer'` on the underlying native WebSocket to ensure compatible and efficient handling of arbitrary binary protocols.
