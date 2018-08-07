# P2P Media Loader Core

Core functionality for P2P sharing of segmented media streams (i.e. HLS, DASH) using WebRTC.

Useful links:
- [Demo](http://novage.com.ua/p2p-media-loader/demo.html)
- [Overview](http://novage.com.ua/p2p-media-loader/overview.html)
- [Technical overview](http://novage.com.ua/p2p-media-loader/technical-overview.html)
- JS CDN
  - [Core](https://cdn.jsdelivr.net/npm/p2p-media-loader-core@latest/build/)
  - [Hls.js integration](https://cdn.jsdelivr.net/npm/p2p-media-loader-hlsjs@latest/build/)
  - [Shaka integration](https://cdn.jsdelivr.net/npm/p2p-media-loader-shaka@latest/build/)

# API

The library uses `window.p2pml.core` as a root namespace in Web browser for:
- `HybridLoader` - HTTP and P2P loader
- `Events` - Events emitted by `HybridLoader`
- `Segment` - Media stream segment
- `version` - API version

---

## `HybridLoader`

HTTP and P2P loader.

### `HybridLoader.isSupported()`

Returns `true` if WebRTC data channels API is supported by the browser. Read more [here](http://iswebrtcreadyyet.com/legacy.html).

### `loader = new HybridLoader([settings])`

Creates a new `HybridLoader` instance.

If `settings` is specified, then the default settings (shown below) will be overridden.

| Name | Type | Default Value | Description |
| --- | ---- | ------ | ------ |
| `cachedSegmentExpiration` | Integer | 300000 | Segment lifetime in cache. The segment is deleted from the cache if the last access time is greater than this value (in milliseconds)
| `cachedSegmentsCount` | Integer | 30 | Max number of segments that can be stored in the cache
| `requiredSegmentsPriority` | Integer | 1 | The maximum priority of the segments to be downloaded (if not available) as quickly as possible (i.e. via HTTP method)
| `useP2P` | Boolean | true | Enable/Disable peers interaction
| `simultaneousP2PDownloads` | Integer | 3 | Max number of simultaneous downloads from peers
| `httpDownloadProbability` | Float | 0.06 | Probability of downloading remaining not downloaded segment in the segments queue via HTTP
| `httpDownloadProbabilityInterval` | Integer | 500 | Interval of the httpDownloadProbability check (in milliseconds)
| `bufferedSegmentsCount` | Integer | 20 | Max number of the segments to be downloaded via HTTP or P2P methods
| `trackerAnnounce` | String[] | [ "wss://tracker.btorrent.xyz/", "wss://tracker.openwebtorrent.com/" ] | Torrent trackers (announcers) to use
| `webRtcMaxMessageSize` | number | 64 * 1024 - 1 | Max WebRTC message size. 64KiB - 1B should work with most of recent browsers. Set it to 16KiB for older browsers support. 
| `p2pSegmentDownloadTimeout` | number | 60000 | Timeout to download a segment from a peer. If exceeded the peer is dropped. 
| `rtcConfig` | RTCConfiguration | Object | An RTCConfiguration dictionary providing options to configure WebRTC connections.

### `loader.load(segments, swarmId)`

Creates new queue of segments to download. Aborts all http and peer connections for segments that are not in the new load and emits `Events.SegmentAbort` event for each aborted event.

Function args:
- `segments` - array of `Segment` class instances with populated `url` and `priority` field;
- `swarmId` - used for gathering peers in pool;

### `loader.on(Events.SegmentLoaded, function (segment) {})`

Emitted when segment have been downloaded.

Listener args:
- `segment` - instance of `Segment` class with populated `url` and `data` fields;

### `loader.on(Events.SegmentError, function (segment, error) {})`

Emitted when an error occurred while loading the segment.

Listener args:
- `segment` - url of the segment;
- `error` - error details;

### `loader.on(Events.SegmentAbort, function (segment) {})`

Emitted for each segment that does not hit into a new segments queue when the `load` method is called.

Listener args:
- `segment` - aborted segment;

### `loader.on(Events.PeerConnect, function (peer) {})`

Emitted when a peer is connected.

Listener args:
- `peer` - peer object with populated `id` and `remoteAddress` fields;

### `loader.on(Events.PeerClose, function (peerId) {})`

Emitted when a peer is disconnected.

Listener args:
- `peerId` - Id of the disconnected peer;

### `loader.on(Events.PieceBytesDownloaded, function (method, bytes) {})`

Emitted when a segment piece downloaded.

Listener args: 
- `method` - downloading method, possible values: `http`, `p2p`;
- `bytes` - amount of bytes downloaded;

### `loader.on(Events.PieceBytesUploaded, function (method, bytes) {})`

Emitted when a segment piece uploaded.

Listener args:
- `method` - uploading method, possible values: `p2p`;
- `bytes` - amount of bytes downloaded;

### `loader.getSettings()`

Returns loader instance settings.

### `loader.getSegment(id)`

Returns a segment from loader cache or undefined if the segment is not available.

Function args:
- `id` - Id of the segment;

### `loader.destroy()`

Destroys loader: abort all connections (http, tcp, peer), clears cached segments.

---

## `Events`

Events that are emitted by `HybridLoader`.

- SegmentLoaded
- SegmentError
- SegmentAbort
- PeerConnect
- PeerClose
- PieceBytesDownloaded
- PieceBytesUploaded

---

## `Segment`

Media stream segment.

Instance contains:
- `id`
    + a `String`
    + unique identifier of the segment across peers
    + can be equal to URL if it is the same for all peers
- `url`
    + a `String`
    + URL of the segment
- `range`
    + a `String`
    + must be valid HTTP Range header value or `undefined`
- `priority`
    + a non-negative integer `Number`
    + the lower value - the higher priority
    + default is `0`
- `data`
    + an `ArrayBuffer`
    + available only when segment is fully loaded; subscribe to `SegmentLoaded`
      event for this very moment
- `downloadSpeed`
    + a non-negative integer `Number`
    + download speed in bytes per millisecond or 0

---

## Usage Example

```javascript
var loader = new p2pml.core.HybridLoader();

loader.on(p2pml.core.Events.SegmentLoaded, function (segment) {
    console.log("Loading finished, bytes:", segment.data.byteLength);
});

loader.on(p2pml.core.Events.SegmentError, function (segment, error) {
    console.log("Loading failed", segment, error);
});

loader.load([
    new p2pml.core.Segment("segment-1", "//url/to/segment/1", undefined, 0),
    new p2pml.core.Segment("segment-2", "//url/to/segment/2", undefined, 1),
    new p2pml.core.Segment("segment-3", "//url/to/segment/3", undefined, 2)
], "swarm-1");
```
