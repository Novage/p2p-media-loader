# API

P2P Medial Loader uses `window.p2pml`, a root object as a namespace.
It is the only global identifier the library defines.

---

## `hlsjs`

Implementation for [hls.js](https://github.com/video-dev/hls.js).

### `createLoaderClass(settings)`

Returns a `function`, a class constructor, which can be used with your custom
created hls.js instance. Please note that you don't need to use this function
in case you are using one of init-specific-player functions
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
