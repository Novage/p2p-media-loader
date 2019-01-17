# P2P Media Loader - Shaka Player integration

[![npm version](https://badge.fury.io/js/p2p-media-loader-shaka.svg)](https://npmjs.com/package/p2p-media-loader-shaka)

P2P sharing of segmented media streams (i.e. HLS, MPEG-DASH) using WebRTC for [Shaka Player](https://github.com/google/shaka-player)

Useful links:
- [Demo](http://novage.com.ua/p2p-media-loader/demo.html)
- [Overview](http://novage.com.ua/p2p-media-loader/overview.html)
- [Technical overview](http://novage.com.ua/p2p-media-loader/technical-overview.html)
- JS CDN
  - [Core](https://cdn.jsdelivr.net/npm/p2p-media-loader-core@latest/build/)
  - [Shaka Player integration](https://cdn.jsdelivr.net/npm/p2p-media-loader-shaka@latest/build/)
  - [Hls.js integration](https://cdn.jsdelivr.net/npm/p2p-media-loader-hlsjs@latest/build/)

## Basic usage

General steps are:

1. Include P2P Medial Loader scripts.
2. Create P2P Medial Loader engine instance.
3. Create a player instance.
4. Call init function for the player.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <title>Shaka Player with P2P Media Loader</title>
    <meta charset="utf-8">
    <script src="https://cdn.jsdelivr.net/npm/p2p-media-loader-core@latest/build/p2p-media-loader-core.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/p2p-media-loader-shaka@latest/build/p2p-media-loader-shaka.min.js"></script>
    <script src="https://github.com/videojs/mux.js/releases/download/v4.4.0/mux.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/shaka-player/2.4.4/shaka-player.compiled.js"></script>
</head>
<body>
    <video id="video" width="640" controls autoplay muted></video>
    <script>
        shaka.polyfill.installAll();
        if (shaka.Player.isBrowserSupported() && p2pml.shaka.Engine.isSupported()) {
            function onError(error) { console.error("Error code", error.code, "object", error); }

            var engine = new p2pml.shaka.Engine();

            var player = new shaka.Player(document.getElementById("video"));
            player.addEventListener("error", function(event) { onError(event.detail); });

            engine.initShakaPlayer(player);

            player.load("https://akamai-axtest.akamaized.net/routes/lapd-v1-acceptance/www_c4/Manifest.mpd").catch(onError);
        } else {
            document.write("Not supported :(");
        }
    </script>
</body>
</html>
```

# API

The library uses `window.p2pml.shaka` as a root namespace in Web browser for:
- `Engine` - Shaka Player support engine
- `version` - API version

---

## `Engine`

Shaka Player support engine.

### `Engine.isSupported()`

Returns result from `p2pml.core.HybridLoader.isSupported()`.

### `engine = new Engine([settings])`

Creates a new `Engine` instance.

`settings` structure:
- `segments`
    + `forwardSegmentCount` - Number of segments for building up predicted forward segments sequence; used to predownload and share via P2P. Default is 20;
    + `maxHistorySegments` - Maximum amount of requested segments manager should remember; used to build up sequence with correct priorities for P2P sharing. Default is 50;
    + `swarmId` - Override default swarm ID that is used to identify unique media stream with trackers (manifest URL without query parameters is used as the swarm ID if the parameter is not specified);
- `loader`
    + settings for `HybridLoader` (see [P2P Media Loader Core API](../p2p-media-loader-core/README.md#loader--new-hybridloadersettings) for details);

### `engine.getSettings()`

Returns engine instance settings.

### `engine.getDetails()`

Returns engine instance details.

### `engine.destroy()`

Destroys engine; destroy loader and segment manager.

### `engine.initShakaPlayer(player)`

Shaka Player integration.

`player` should be valid Shaka Player instance.

Example
```javascript
shaka.polyfill.installAll();

var engine = new p2pml.shaka.Engine();

var video = document.getElementById("video");
var player = new shaka.Player(video);

engine.initShakaPlayer(player);

player.load("https://example.com/path/to/your/dash.mpd");
```
