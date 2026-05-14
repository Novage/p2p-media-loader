# WebSocket Client Specification

A robust, universal WebSocket client. It automatically maintains the connection and reconnects using Exponential Backoff and Jitter.

## Constructor / Configuration Options

The client should be configurable upon instantiation:

- `url` (string): The WebSocket endpoint to connect to.
- `initialDelay` (number, ms): The initial wait time before the first reconnection attempt. Default: `1000`.
- `maxDelay` (number, ms): The maximum wait time between reconnection attempts. Default: `30000`.
- `jitterMultiplier` (number): A multiplier used to add randomness to the delay, preventing thundering herd problems. Default: `0.2`.

## Properties

Expose the following state to consumers:

- `state` (enum/string): Current state of the client (`'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'disposed'`).

## Methods

- `connect()`: Initiates the WebSocket connection.
- `send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void`: Sends data over the WebSocket. Must support binary data.
- `dispose()`: Completely tears down the client, stops all timers, closes the socket, and prevents future automatic reconnections.

## Events

The client should emit the following lifecycle events:

- `connected`: Fired when the WebSocket connection is successfully established.
- `disconnected`: Fired when the connection is lost (or deliberately closed).
- `reconnecting`: Fired when a reconnection attempt is scheduled.
- `error`: Fired when a WebSocket error occurs.
- `message`: Fired when a message is received from the server.

## Architectural Behaviors

1. **Exponential Backoff & Jitter**: Reconnection delays increase exponentially with a random jitter factor to avoid overwhelming the server upon restart.
2. **Binary Compatibility**: Configures `binaryType = 'arraybuffer'` on the underlying socket to ensure compatibility with arbitrary binary protocols.
