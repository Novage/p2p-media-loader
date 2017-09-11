# API

P2P Medial Loader uses `window.p2pml`, a root object as a namespace.
It is the only global identifier the library defines.

---

## `hlsjs`

Contains implementation for [hls.js](https://github.com/video-dev/hls.js).

### `createLoaderClass(settings)`

Creates class, which can be used with your custom created hls.js instance.

#### `settings`

Every setting is optional until opposite explicitly stated.

- `segmentManager`
    + a `SegmentManager` instance to use
    + if not set, a default one will be created with new `HybridLoader`.
- `loaderSettings`:
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
        - a positive float `Number` in from 0.01 to 0.99
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

---

## `HttpLoader`

???

---

## `HybridLoader`

???

---

## `LoaderEvents`

???

---

## `Segment`

Single smallest piece of data that can be requested to load.

Instance contains:
- `url`
    - a `String`
- `priority`
    - a non-negative integer `Number`
    - the lower value - the higher priority
    - default is `0`
- `data`
    - an `ArrayBuffer`
    - available only when segment is fully loaded; subscribe to `SegmentLoaded`
      event for this very moment

---

## `WEBRTC_SUPPORT`

Contains `true` if WebRTC is supported by the browser.
