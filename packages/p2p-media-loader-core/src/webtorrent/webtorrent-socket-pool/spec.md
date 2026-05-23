# WebTorrent Socket Pool

## Overview

`WebTorrentSocketPool` manages the lifecycle and reuse of WebSocket connections (`WebSocketClient`) for WebTorrent trackers. It ensures that a single connection per unique URL is shared across multiple clients requiring access, avoiding redundant socket connections.

## Reference Counting & Lifecycle

- When a `WebSocketClient` for a specific URL is requested via `acquire(url)`, the pool checks if an active connection exists.
- If one exists, the pool increments its reference count and returns the client along with a `release` function.
- If one doesn't exist, the pool creates a new `WebSocketClient`, establishes a connection, initializes its reference count to `1`, and stores it.
- When `release` is called, the reference count is decremented.
- If the reference count drops to `0`, the socket is fully disconnected (`dispose` is called) and removed from the pool.

## Event Handling

The pool implements an event target system (`EventTarget`) that emits global events for the underlying sockets it manages.

- **`error`**: Dispatched when any managed `WebSocketClient` encounters an error. Provides the underlying `Event` object as well as the tracker `url` where the error originated.

## API Reference

### `acquire(url: string): { client: WebSocketClient; release: () => void }`

Acquires a `WebSocketClient` for the given URL.

- Returns an object containing:
  - `client`: The `WebSocketClient` instance.
  - `release`: A callback function to release the reference to the client. This callback is idempotent and gracefully handles multiple calls by only releasing once.

### `addEventListener<K extends keyof WebTorrentSocketPoolEventMap>(eventName: K, listener: WebTorrentSocketPoolEventMap[K]): void` / `removeEventListener<K extends keyof WebTorrentSocketPoolEventMap>(eventName: K, listener: WebTorrentSocketPoolEventMap[K]): void`

Allows attaching and detaching event listeners to the pool.

- Supported events:
  - `error`: `(error: Event, url: string) => void` - Listen for underlying socket errors.

### `destroy(): void`

Forcefully disposes of all pooled `WebSocketClient` connections and cleans up all existing event listeners. It safely catches and logs any errors thrown during individual socket disposal.
