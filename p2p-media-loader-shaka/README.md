# P2P Media Loader - Shaka Player integration

P2P sharing of segmented media streams (i.e. HLS, DASH) using WebRTC for [Shaka Player](https://github.com/google/shaka-player)

Useful links:
- [Demo](http://novage.com.ua/p2p-media-loader/demo.html)
- [Overview](http://novage.com.ua/p2p-media-loader/overview.html)
- [Technical overview](http://novage.com.ua/p2p-media-loader/technical-overview.html)
- JS CDN
  - [core](https://cdn.jsdelivr.net/npm/p2p-media-loader-core@latest/build/)
  - [Shaka integration](https://cdn.jsdelivr.net/npm/p2p-media-loader-shaka@latest/build/)
  - [hls.js integration](https://cdn.jsdelivr.net/npm/p2p-media-loader-hlsjs@latest/build/)

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
- `loader`
    + settings for `HybridLoader` (see _P2P Media Loader Core API_ for details);

### `engine.getSettings()`

Returns engine instance settings.

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
