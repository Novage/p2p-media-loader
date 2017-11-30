# `P2P Media Loader Core API`

Core P2P functionality.

## `LoaderInterface`

Set of routines each loader has.

Currently, this interface is implemented by following loaders:
- `HttpLoader`
    + HTTP is used for all segments
- `HybridLoader`
    + HTTP is used for high priority segments
    + P2P is used for low priority segments
    
## `HybridLoader`

Implementation of the `LoaderInterface` that uses HTTP and P2P loading mechanism.

### `loader = new HybridLoader([settings])`

Creates a new `HybridLoader` instance.

If `settings` is specified, then the default settings (shown below) will be overridden.

| Name | Type | Default Value | Description |
| --- | ---- | ------ | ------ |
| segmentIdGenerator | String | (url: string): string => url | Function that generates segment identifier based on the input url argument
| cachedSegmentExpiration | Integer | 300000 | Segment lifetime in cache. The segment is deleted from the cache if the last access time is greater than this value (in milliseconds)
| cachedSegmentsCount | Integer | 30 | Max number of segments that can be stored in the cache
| requiredSegmentsPriority | Integer | 1 | The maximum priority of the segments to be downloaded (if not available) as quickly as possible (i.e. via HTTP method)
| useP2P | Boolean | true | Enable/Disable peers interaction
| simultaneousP2PDownloads | Integer | 3 | Max number of simultaneous downloads from peers
| httpDownloadProbability | Float | 0.06 | Probability of downloading remaining not downloaded segment in the segments queue via HTTP
| httpDownloadProbabilityInterval | Integer | 500 | Interval of the httpDownloadProbability check (in milliseconds)
| bufferedSegmentsCount | Integer | 20 | Max number of the segments to be downloaded via HTTP or P2P methods
| trackerAnnounce | String[] | [ "wss://tracker.btorrent.xyz/", "wss://tracker.openwebtorrent.com/" ] | Torrent trackers (announcers) to use
| webRtcMaxMessageSize | number | 16 * 1024 | Max WebRTC message size. 16KiB is minimal that works with all the browsers. 64KiB - 1B should work for most of recent browsers. 
| p2pSegmentDownloadTimeout | number | 60000 | Timeout to download a segment from a peer. If exceeded the peer is dropped. 

### `loader.load(segments, swarmId, emitNowSegmentUrl)`

Creates new queue of segments to download. Aborts all http and peer connections for segments that are not in the new load and emits `LoaderEvents.SegmentAbort` event for each aborted event. It also emits `LoaderEvents.SegmentLoaded` event for segment with the url specified in the `emitNowSegmentUrl` param.

Function args: 
 - `segments` - array of `Segment` class instances with populated `url` and `priority` field;
 - `swarmId` - used for gathering peers in pool;
 - `emitNowSegmentUrl` - indicates which segment should be emitted immediately if it exists in the cache.

### `loader.on(LoaderEvents.SegmentLoaded,  function (segment) {})`

Emitted when segment have been downloaded or on call of `load` method with specified `emitNowSegmentUrl` if it exists in the cache. 

Listener args: 
 - `segment` - instance of `Segment` class with populated `url` and `data` fields.

### `loader.on(LoaderEvents.SegmentError,  function (url, event) {})`

Emitted when an error occurred while loading the segment. 

Listener args: 
 - `url` - url of the segment;
 - `event` - event associated with an error.

### `loader.on(LoaderEvents.SegmentAbort,  function (url) {})`

Emitted for each segment that does not hit into a new segments queue when the `load` method is called.

Listener args: 
 - `url` - url of the segment.

### `loader.on(LoaderEvents.PeerConnect,  function (peer) {})`

Emitted when a peer is connected.

Listener args: 
 - `peer` - peer object with populated `id` and `remoteAddress` fields.

### `loader.on(LoaderEvents.PeerClose,  function (id) {})`

Emitted when a peer is disconnected.

Listener args: 
 - `id` - peer id.

### `loader.on(LoaderEvents.PieceBytesLoaded,  function (method, size, timestamp) {})`

Emitted when a segment piece loaded.

Listener args: 
 - `method` - method that loaded piece, possible values: `http`, `p2p`;
 - `size` - size of the loaded piece in bytes;
 - `timestamp` - timestamp in millisecond when event was emitted.

### `loader.getSettings()`

Returns loader instance settings.

### `loader.destroy()`

Destroys loader: abort all connections (http, tsp, peer), clear cached segments.

## `HttpLoader`

Implementation of the `LoaderInterface` that uses only HTTP loading mechanism.

### `loader = new HttpLoader()`

Creates a new `HttpLoader` instance.

### `loader.load(segments, swarmId, emitNowSegmentUrl)`

Creates new queue of segments to download. Aborts all http requests for segments that are not in the new load and emits `LoaderEvents.SegmentAbort` event for each aborted event. It also emits `LoaderEvents.SegmentLoaded` event for segment with the url specified in the `emitNowSegmentUrl` param.

Function args: 
 - `segments` - array of `Segment` class instances with populated `url` field;
 - `swarmId` - unused param by current implementation;
 - `emitNowSegmentUrl` - indicates which segment should be emitted immediately if it exists in the cache.

### `loader.on(LoaderEvents.SegmentLoaded,  function (segment) {})`

Emitted when segment have been downloaded or on call of `load` method with specified `emitNowSegmentUrl` if it exists in the cache. 

Listener args: 
 - `segment` - instance of `Segment` class with populated `url` and `data` fields.

### `loader.on(LoaderEvents.SegmentError,  function (url, event) {})`

Emitted when an error occurred while loading the segment. 

Listener args: 
 - `url` - url of the segment;
 - `event` - event associated with an error.

### `loader.on(LoaderEvents.SegmentAbort,  function (url) {})`

Emitted for each segment that does not hit into a new segments queue when the `load` method is called.

Listener args: 
 - `url` - url of the segment.

### `loader.on(LoaderEvents.PieceBytesLoaded,  function (method, size, timestamp) {})`

Emitted when a segment piece loaded.

Listener args: 
 - `method` - method that loaded piece, possible value: `http`;
 - `size` - size of the loaded piece in bytes;
 - `timestamp` - timestamp in millisecond when event was emitted.

### `loader.getSettings()`

Returns loader instance settings.

### `loader.destroy()`

Destroys loader: abort all http connections, clear cached segments.

## `Segment`

Single smallest piece of data that can be requested to load.

Instance contains:
- `url`
    + a `String`
- `priority`
    + a non-negative integer `Number`
    + the lower value - the higher priority
    + default is `0`
- `data`
    + an `ArrayBuffer`
    + available only when segment is fully loaded; subscribe to `SegmentLoaded`
      event for this very moment
      
## `LoaderEvents`

Events that are emitted by `HttpLoader` and `HybridLoader` loaders, please see implementation of these loaders. 

- SegmentLoaded
- SegmentError
- SegmentAbort
- PeerConnect
- PeerClose
- PieceBytesLoaded

Usage:

```javascript
var loader = new HybridLoader();
loader.on(LoaderEvents.SegmentError, function (url, error) {
    console.log("Loading failed", url, error);
});
```
