# API

P2P Medial Loader uses `window.p2pml`, a root object as a namespace.
It is the only global identifier the library defines.

---

## `hlsjs`

Implementation for [hls.js](https://github.com/video-dev/hls.js).

### `createLoaderClass(settings)`

Returns a `function`, a class constructor, which can be used with your custom
created hls.js instance. Please note that in most cases you don't need to use
this function when you are using one of init-specific-player functions
(e.g. `initHlsJsPlayer`).

#### `settings`

Every setting is optional until opposite explicitly stated.

- `segmentManager`
    + a `SegmentManager` instance to use;
      please note that `loaderSettings` value is ignored in this case
    + if not set, a new one will be created with `HybridLoader` and provided
      `loaderSettings`
- `loaderSettings`, an `Object` with properties:
    + `bufferSegmentsCount`
        - a positive integer `Number`
        - ???
        - default is `20`
    + `cacheSegmentExpiration`
        - a positive integer `Number` in milliseconds
        - when this value exceeds for any particular segment, it will be
          dropped from the cache
        - default is `300000` (5 mins)
    + `lastSegmentProbability`
        - a positive float `Number` from 0.01 to 0.99
        - ???
        - default is `0.05`
    + `lastSegmentProbabilityInterval`
        - a positive integer `Number` in milliseconds
        - ???
        - default is `1000`
    + `maxCacheSegmentsCount`
        - a positive integer `Number`
        - when this value exceeds, oldest segment will be dropped from
          the cache
        - default is `20`
    + `useP2P`
        - a `Boolean`
        - default is `true`
    + `requiredSegmentsCount`
        - a positive integer `Number`
        - default is `2`
    + `segmentIdGenerator`
        - a `function` takes URL as `String` and returns ID as `String`
        - default is: segment URL is equivalent to segment ID 
    + `simultaneousP2PDownloads`
        - a positive integer `Number`
        - used only when `useP2P` is `true`
        - default is `3`
    + `trackerAnnounce`
        - an `Array` of trackers to use
        - default is `[ "wss://tracker.btorrent.xyz/", "wss://tracker.openwebtorrent.com/" ]`

### `initClapprPlayer(player, settings)`

[Clappr](https://github.com/clappr/clappr/) player support.

- `player`
    + valid Clappr player instance
- `settings`
    + optional; format same as for `settings` in `createLoaderClass`

Example
```javascript
var player = new Clappr.Player({
    parentId: "#video",
    source: "https://example.com/path/to/your/playlist.m3u8"
});

p2pml.hlsjs.initClapprPlayer(player);

player.play();
```

### `initFlowplayerHlsJsPlayer(player, settings)`

[Flowplayer](https://github.com/flowplayer/flowplayer) support.

- `player`
    + valid Flowplayer instance
- `settings`
    + optional; format same as for `settings` in `createLoaderClass`

Example
```javascript
var player = flowplayer("#video", {
    clip: {
        sources: [{
            src: "https://example.com/path/to/your/playlist.m3u8",
            type: "application/x-mpegurl",
            live: true // set this accordingly to your playlist
        }]
    }
});

p2pml.hlsjs.initFlowplayerHlsJsPlayer(player);

player.on("ready", function () {
    player.play();
});
```

### `initHlsJsPlayer(player, settings)`

[hls.js](https://github.com/video-dev/hls.js) player support.

- `player`
    + valid hls.js player instance
- `settings`
    + optional; format same as for `settings` in `createLoaderClass`

Example
```javascript
var player = new Hls();
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

Creates new instance. `loader` is required and must be instance of
`LoaderInterface` implementation (e.g. `HttpLoader`, `HybridLoader`).

#### `processPlaylist(url, type, content)`

Processes playlist with given content.

- `url`
    + a `String` with playlist URL
- `type`
    + a `String` with type of the playlist in terms of hls.js
      (e.g. `"manifest"`, `"level"`, etc.)
- `content`
    + a `String` with content of the playlist

#### `loadPlaylist(url, type, loadChildPlaylists)`

Asynchronously loads content of the playlist via HTTP. Automatically calls
`processPlaylist`.

- `url`
    + a `String` with playlist URL
- `type`
    + a `String` with type of the playlist in terms of hls.js
      (e.g. `"manifest"`, `"level"`, etc.)
- `loadChildPlaylists`
    + if `true` and this is `manifest` playlist, it will load all `level`
      playlists it has via HTTP and automatically call `processPlaylist` for
      each of them.
    + default is `false`.

Returns `Promise`.

#### `loadSegment(url, onSuccess, onError, playlistMissRetries)`

Asynchronously loads segment from one of previously loaded playlists. This
method locates requested segment in known playlists. Please note, only segments
from `level` type playlist will be loaded via the `loader` (provided in the
`constructor`); others will be loaded via HTTP.

- `url`
    + a `String` with segment URL
- `onSuccess`
    + an optional `function`; called when segment finished loading
- `onError`
    + an optional `function`; called when segment failed to load
- `playlistMissRetries`
    + an optional positive integer `Number` defines amount of tries should
      be made before considered an error occurred (and call `onError` if any)
    + timeout between tries is 500 ms
    + default is `1`

#### `setCurrentSegment(url)`

Sets current playing segment by the player.

- `url`
    + a `String` with segment URL

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

---

## `HttpLoader`

???

---

## `HybridLoader`

???

---

## `LoaderEvents`

Events supported by loaders. You can subscribe to a specific event next way:
```javascript
var loader = new HybridLoader();
loader.on(LoaderEvents.SegmentError, function (url, error) {
    console.log("Loading failed", url, error);
});
```

### `ForceProcessing`

Force processing ???

This event has no arguments.

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
3. `timestamp` from `Date.now()`

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

---

## `WEBRTC_SUPPORT`

Contains `true` if WebRTC data channels API is supported by the browser.
Read more [here](http://iswebrtcreadyyet.com/legacy.html).
