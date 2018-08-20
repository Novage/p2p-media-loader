# P2P Media Loader - Hls.js integration

[![npm version](https://badge.fury.io/js/p2p-media-loader-hlsjs.svg)](https://npmjs.com/package/p2p-media-loader-hlsjs)

P2P sharing of segmented media streams (i.e. HLS) using WebRTC for [Hls.js](https://github.com/video-dev/hls.js)

Useful links:
- [Demo](http://novage.com.ua/p2p-media-loader/demo.html)
- [Overview](http://novage.com.ua/p2p-media-loader/overview.html)
- [Technical overview](http://novage.com.ua/p2p-media-loader/technical-overview.html)
- JS CDN
  - [Core](https://cdn.jsdelivr.net/npm/p2p-media-loader-core@latest/build/)
  - [Hls.js integration](https://cdn.jsdelivr.net/npm/p2p-media-loader-hlsjs@latest/build/)
  - [Shaka integration](https://cdn.jsdelivr.net/npm/p2p-media-loader-shaka@latest/build/)

## Basic usage

General steps are:

1. Include P2P Medial Loader scripts.
2. Create P2P Medial Loader engine instance.
3. Create a player instance.
4. Call init function for the player.

**P2P Media Loader** supports many players that use Hls.js as media engine. Lets pick [Clappr](https://github.com/clappr/clappr) just for this example:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <title>Clappr/Hls.js with P2P Media Loader</title>
    <meta charset="utf-8">
    <script src="https://cdn.jsdelivr.net/npm/p2p-media-loader-core@latest/build/p2p-media-loader-core.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/p2p-media-loader-hlsjs@latest/build/p2p-media-loader-hlsjs.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/clappr@latest"></script>
</head>
<body>
    <div id="player"></div>
    <script>
        if (p2pml.hlsjs.Engine.isSupported()) {
            var engine = new p2pml.hlsjs.Engine();

            var player = new Clappr.Player({
                parentId: "#player",
                source: "https://akamai-axtest.akamaized.net/routes/lapd-v1-acceptance/www_c4/Manifest.m3u8",
                mute: true,
                autoPlay: true,
                hlsjsConfig: {
                    liveSyncDurationCount: 7,
                    loader: engine.createLoaderClass()
                }
            });

            p2pml.hlsjs.initClapprPlayer(player);
        } else {
            document.write("Not supported :(");
        }
    </script>
</body>
</html>
```

# API

The library uses `window.p2pml.hlsjs` as a root namespace in Web browser for:
- `Engine` - hls.js support engine
- `initHlsJsPlayer` - [hls.js](https://github.com/video-dev/hls.js) player integration
- `initClapprPlayer` - [Clappr](https://github.com/clappr/clappr) player integration
- `initFlowplayerHlsJsPlayer` - [Flowplayer](https://flowplayer.com) integration
- `initJwPlayer` - [JW Player](https://www.jwplayer.com) integration
- `initMediaElementJsPlayer` - [MediaElement.js](https://www.mediaelementjs.com) player integration
- `initVideoJsContribHlsJsPlayer` - [Video.js](https://videojs.com) player integration
- `version` - API version

---

## `Engine`

hls.js support engine.

### `Engine.isSupported()`

Returns result from `p2pml.core.HybridLoader.isSupported()`.

### `engine = new Engine([settings])`

Creates a new `Engine` instance.

`settings` structure:
- `segments`
    + `forwardSegmentCount` - Number of segments for building up predicted forward segments sequence; used to predownload and share via P2P. Default is 20;
- `loader`
    + settings for `HybridLoader` (see [P2P Media Loader Core API](../p2p-media-loader-core/README.md#loader--new-hybridloadersettings) for details);

### `engine.getSettings()`

Returns engine instance settings.

### `engine.createLoaderClass()`

Creates hls.js loader class bound to this engine.

### `engine.setPlayingSegment(url)`

Notifies engine about current playing segment url.

Needed for own integrations with other players. If you write one, you should update engine with current playing segment url from your player.

### `engine.destroy()`

Destroys engine; destroy loader and segment manager.

---

## Player Integrations

We support many players, but it is possible to write your own integration in case it is no supported at the moment. Feel free to make pull requests with your player integrations.

In order a player to be able to integrate with the Engine, it should meet following requirements:
1. Player based on `hls.js`.
2. Player allows to pass `hls` configuration. This is needed for us to be able to override hls.js `loader`.
3. Player allows to subcribe to events on hls.js player.
    - If player exposes `hls` object, you just call `p2pml.hlsjs.initHlsJsPlayer(hls)`;
    - Or if player allows to directly subsctibe to hls.js events, you need to handle:
        + `hlsFragChanged` - call `engine.setPlayingSegment(url)` to notify Engine about current playing segment url;
        + `hlsDestroying` - call `engine.destroy()` to inform Engine about destroying hls.js player;

### `initHlsJsPlayer(player)`

[hls.js](https://github.com/video-dev/hls.js) player integration.

`player` should be valid hls.js instance.

Example
```javascript
var engine = new p2pml.hlsjs.Engine();

var hls = new Hls({
    liveSyncDurationCount: 7,
    loader: engine.createLoaderClass()
});

p2pml.hlsjs.initHlsJsPlayer(hls);

hls.loadSource("https://example.com/path/to/your/playlist.m3u8");

var video = document.getElementById("video");
hls.attachMedia(video);
```

### `initClapprPlayer(player)`

[Clappr](https://github.com/clappr/clappr) player integration.

`player` should be valid Clappr player instance.

Example
```javascript
var engine = new p2pml.hlsjs.Engine();

var player = new Clappr.Player({
    parentId: "#video",
    source: "https://example.com/path/to/your/playlist.m3u8",
    hlsjsConfig: {
        liveSyncDurationCount: 7,
        loader: engine.createLoaderClass()
    }
});

p2pml.hlsjs.initClapprPlayer(player);
```

### `initFlowplayerHlsJsPlayer(player)`

[Flowplayer](https://flowplayer.com) integration.

`player` should be valid Flowplayer instance.

Example
```javascript
var engine = new p2pml.hlsjs.Engine();

var player = flowplayer("#video", {
    clip: {
        sources: [{
            src: "https://example.com/path/to/your/playlist.m3u8",
            type: "application/x-mpegurl"
        }]
    },
    hlsjs: {
        liveSyncDurationCount: 7,
        loader: engine.createLoaderClass()
    }
});

p2pml.hlsjs.initFlowplayerHlsJsPlayer(player);
```

### `initJwPlayer(player)`

[JW Player](https://www.jwplayer.com) integration.

`player` should be valid JW Player instance.

Example
```javascript
var engine = new p2pml.hlsjs.Engine();

var player = jwplayer("player");

player.setup({
    file: "https://example.com/path/to/your/playlist.m3u8"
});

var provider = require("@hola.org/jwplayer-hlsjs");
provider.attach();

p2pml.hlsjs.initJwPlayer(player, {
    liveSyncDurationCount: 7,
    loader: engine.createLoaderClass()
});
```

### `initMediaElementJsPlayer(mediaElement)`

[MediaElement.js](https://www.mediaelementjs.com) player integration.

`mediaElement` should be valid value received from _success_ handler of the _MediaElementPlayer_.

Example
```javascript
var engine = new p2pml.hlsjs.Engine();

// allow only one supported renderer
mejs.Renderers.order = [ "native_hls" ];

var player = new MediaElementPlayer("video", {
    hls: {
        liveSyncDurationCount: 7,
        loader: engine.createLoaderClass()
    },
    success: function (mediaElement) {
        p2pml.hlsjs.initMediaElementJsPlayer(mediaElement);
    }
});

player.setSrc("https://example.com/path/to/your/playlist.m3u8");
player.load();
```

### `initVideoJsContribHlsJsPlayer(player)`

[Video.js](https://videojs.com) player integration.

`player` should be valid Video.js player instance.

Example
```javascript
var engine = new p2pml.hlsjs.Engine();

var player = videojs("video", {
    html5: {
        hlsjsConfig: {
            liveSyncDurationCount: 7,
            loader: engine.createLoaderClass()
        }
    }
});

p2pml.hlsjs.initVideoJsContribHlsJsPlayer(player);

player.src({
    src: "https://example.com/path/to/your/playlist.m3u8",
    type: "application/x-mpegURL"
});
```
