# API

P2P Medial Loader uses `window.p2pml`, a root object as a namespace.
It is the only global identifier the library defines.

---

## `hlsjs`

Implementation for [hls.js](https://github.com/video-dev/hls.js).

### `createLoaderClass(settings)`

Returns a `function`, a class constructor, which should be used to configure
hls.js instance. Returns default hls.js loader if
functionality is not supported.

#### `settings`

Every setting is optional until opposite explicitly stated.

- `segmentManager`
    + a `SegmentManager` instance to use;
      please note that `loaderSettings` value is ignored in this case
    + if not set, a new one will be created with `HybridLoader` and provided
      `loaderSettings`
- `loaderSettings`, setting passed to `HybridLoader`

### `initClapprPlayer(player)`

[Clappr](https://github.com/clappr/clappr/) player support.

- `player`
    + valid Clappr player instance

Example
```javascript
var player = new Clappr.Player({
    parentId: "#video",
    source: "https://example.com/path/to/your/playlist.m3u8"
    hlsjsConfig: {
        liveSyncDurationCount: 7, // To have at least 7 segments in queue
        loader: p2pml.hlsjs.createLoaderClass()
    }
});

p2pml.hlsjs.initClapprPlayer(player);

player.play();
```

### `initFlowplayerHlsJsPlayer(player)`

[Flowplayer](https://github.com/flowplayer/flowplayer) support.

- `player`
    + valid Flowplayer instance

Example
```javascript
var player = flowplayer("#video", {
    clip: {
        sources: [{
            src: "https://example.com/path/to/your/playlist.m3u8",
            type: "application/x-mpegurl",
            live: true // set this accordingly to your playlist
        }]
    },
    hlsjs: {
        liveSyncDurationCount: 7, // To have at least 7 segments in queue
        loader: p2pml.hlsjs.createLoaderClass()
    }
});

p2pml.hlsjs.initFlowplayerHlsJsPlayer(player);

player.on("ready", function () {
    player.play();
});
```

### `initHlsJsPlayer(player)`

[hls.js](https://github.com/video-dev/hls.js) player support.

- `player`
    + valid hls.js player instance

Example
```javascript
var player = new Hls({
    liveSyncDurationCount: 7, // To have at least 7 segments in queue
    loader: p2pml.hlsjs.createLoaderClass()
});
p2pml.hlsjs.initHlsJsPlayer(player);

player.loadSource("https://example.com/path/to/your/playlist.m3u8");

var video = document.getElementById("video");
player.attachMedia(video);
player.on(Hls.Events.MANIFEST_PARSED, function () {
    video.play();
});
```

### `initMediaElementJsPlayer(mediaElement)`

[MediaElement.js](https://github.com/mediaelement/mediaelement) player support.

- `mediaElement`
    + object, received with `success` handler (see example below)

Example
```javascript
mejs.Renderers.order = [ "native_hls" ]; // allow only one supported renderer

var player = new MediaElementPlayer("video", {
    stretching: "responsive",
    hls: {
        liveSyncDurationCount: 7, // To have at least 7 segments in queue
        loader: p2pml.hlsjs.createLoaderClass()
    },
    success: function (mediaElement) {
        p2pml.hlsjs.initMediaElementJsPlayer(mediaElement);
    }
});

player.setSrc("https://example.com/path/to/your/playlist.m3u8");
player.options.forceLive = true; // set this accordingly to your playlist

player.load();
player.play();
```

### `initVideoJsContribHlsJsPlayer(player)`

[video.js HLS Source Handler](https://github.com/videojs/videojs-contrib-hls) support.

- `player`
    + valid video.js player instance

Example
```javascript
var player = videojs("video", {
    html5: {
        hlsjsConfig: {
            liveSyncDurationCount: 7, // To have at least 7 segments in queue
            loader: p2pml.hlsjs.createLoaderClass()
        }
    }
});

p2pml.hlsjs.initVideoJsContribHlsJsPlayer(player);

player.src({
    src: "https://example.com/path/to/your/playlist.m3u8",
    type: "application/x-mpegURL"
});
```

### `SegmentManager`

Provides playlists and segments management.

#### `constructor(loader)`

Creates new instance.

- `loader`
    + instance of `LoaderInterface` implementation (e.g. `HttpLoader`,
      `HybridLoader`).

#### `isSupported()`

Returns `true` if the segment manager is supported by the browser.

#### `abortSegment(url)`

Aborts segment loading (previously requested via `loadSegment`). Please note,
there will be no `onSuccess` nor `onError` handlers called after calling to
this method.

- `url`
    + a `String` with segment URL

#### `destroy()`

Destroys this `SegmentManager` instance. If there is pending segment, its
`onError` handler will be called if available. You cannot use this instance
any more once you have called `destroy`.

Please note, this method also destroys `loader` object given via `constructor`.

#### `loadPlaylist(url, type, loadChildPlaylists)`

Asynchronously loads content of the playlist via HTTP. Automatically calls
`processPlaylist`.

- `url`
    + a `String` with playlist URL
- `type`
    + a `String` with type of the playlist in terms of hls.js
      (e.g. `"manifest"`, `"level"`, etc.)
- `loadChildPlaylists`
    + if `true` and this is `"manifest"` playlist, it will load all `"level"`
      playlists it has via HTTP and automatically call `processPlaylist` for
      each of them.
    + default is `false`.

Returns `Promise`.

#### `loadSegment(url, onSuccess, onError)`

Asynchronously loads segment from one of previously loaded playlists. This
method locates requested segment in known playlists. Please note, only segments
from `"level"` type playlist will be loaded via the `loader` (provided in the
`constructor`); others will be loaded via HTTP.

- `url`
    + a `String` with segment URL
- `onSuccess`
    + an optional `function`; called when segment finished loading
- `onError`
    + an optional `function`; called when segment failed to load

#### `processPlaylist(url, type, content)`

Processes playlist with given content.

- `url`
    + a `String` with playlist URL
- `type`
    + a `String` with type of the playlist in terms of hls.js
      (e.g. `"manifest"`, `"level"`, etc.)
- `content`
    + a `String` with content of the playlist

#### `setCurrentSegment(url)`

Sets current playing segment by the player.

- `url`
    + a `String` with segment URL

---

## `LoaderInterface`

Set of routines each loader has.

Currently, this interface is implemented by following loaders:
- `HttpLoader`
    + HTTP is used for all segments
- `HybridLoader`
    + HTTP is used for high priority segments
    + P2P is used for low priority segments

### `destroy()`

Destroys this loader instance. You cannot use this instance any more once you
have called `destroy`.

### `getSettings()`

Returns current settings of the loader.

### `isSupported()`

Returns `true` if the loader is supported by the browser.

### `load(segments, swarmId, emitNowSegmentUrl)`

- `segments`
    + an `Array`
    + each item is a `Segment` (`url` and `priority` fields must be set)
- `swarmId`
    + a `String`
    + unique identifier for this queue
    + generally each video quality should have different `swarmId`, so
      players playing same quality are connect to peers with same segments
- `emitNowSegmentUrl`
    + an optional `String`
    + if set, segment with given URL will get emitted with `SegmentLoaded`,
      `SegmentError` or `SegmentAbort` event when ready

### `on(eventName, listener)`

- `eventName`
    + a `String`
    + must be one of `LoaderEvents` value
- `listener`
    + a `function`
    + handler to call when event occurres; please see `LoaderEvents` section
      for each event argument list

Returns `this`.

---

## `LoaderEvents`

Events supported by loaders. You can subscribe to a specific event next way:
```javascript
var loader = new HybridLoader();
loader.on(LoaderEvents.SegmentError, function (url, error) {
    console.log("Loading failed", url, error);
});
```

### `PeerClose`

A peer has been disconnected.

1. `mediaPeer` object ???

### `PeerConnect`

A new peer has been connected.

1. `mediaPeer` object ???

### `PieceBytesLoaded`

The loading of some part of some segment has been completed.

1. `method` used; can be `"p2p"` or `"http"` only
2. `size` in bytes

### `SegmentAbort`

Segment has been aborted internally.

1. `url` of the segment this event related to

### `SegmentError`
    
Segment failed to load.

1. `url` of the segment this event related to
2. `error` details
    
### `SegmentLoaded`

Segment has been loaded.

1. `segment` loaded with `data` ready to be used

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

## `HybridLoader.isSupported()`

Returns `true` if WebRTC data channels API is supported by the browser.
Read more [here](http://iswebrtcreadyyet.com/legacy.html).
