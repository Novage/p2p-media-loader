# Player adapters

An adapter connects one player to core. It has three responsibilities and no
others. If an adapter is doing something not on this list, that work belongs in
core.

At construction it also supplies the manifest parsers its player needs — the
one piece of configuration an adapter owns, because only it knows which
protocols its player supports. This is a static import, not a runtime choice;
see [packaging.md](packaging.md).

## 1. Feed manifest bytes to core

Hook the player's manifest/playlist loading and pass every response body to
`core.processManifest({ url, data })` before or as the player consumes it.

Do not fetch manifests separately — see the rationale in
[architecture.md](architecture.md).

The same applies to a stream's segment index when it lives outside the manifest
(DASH `SegmentBase`). The player fetches it before any media; the adapter
recognises that request and hands the bytes to `core.processSegmentIndex`. It
is not a media segment and will not resolve against the registry, so it needs
recognising, not looking up. See [manifest-registry.md](manifest-registry.md).

## 2. Serve segment requests through core

Hook the player's segment loader. For each request:

```ts
if (core.isSegmentLoadable(url, byteRange)) {
  // core resolves the URL against its registry and returns bytes,
  // from a peer, from its store, or over HTTP
  const response = await core.loadSegment(url, { byteRange, signal });
} else {
  // core does not recognise this URL: use the player's own loader
}
```

Falling back on an unrecognised URL is normal operation, not an error path. It
is what makes a disagreement between core's parse and the player's harmless.

`isSegmentLoadable` is the one check to make: it answers `false` both for a URL
the registry does not know and for a stream whose P2P is switched off, and it
reports the former through the registry-miss diagnostic. Cancellation goes
through the request's `signal`; an environment without `AbortController` calls
`core.abortSegmentLoading(url, byteRange)` instead.

**Handle manifest and segment requests only, and pass every other type through
untouched.** Licence, key, certificate, timing and steering requests belong to
the player. This is a whitelist by design — the set of request types a player
emits grows over time, and an exclusion list is wrong after the next release.
See [encryption.md](encryption.md).

Two details adapters routinely get wrong:

- **Byte ranges must round-trip exactly.** A segment defined by
  `EXT-X-BYTERANGE` is identified by URL _and_ range; dropping the range
  collides distinct segments.
- **Returned buffers are the adapter's own.** Players that hand data to a
  worker for transmuxing detach the `ArrayBuffer`, and that is safe here: core
  copies at the boundary and never lets a consumer reach what it seeds
  ([architecture.md](architecture.md)). Do not clone again — the copy is
  already made, and a second one is pure cost on every segment played.

## 3. Report playback state

Push `{ bufferAhead, rate }` whenever it changes. Core exports
`getBufferAhead(ranges, currentTime)` so that the range-walking is written once
rather than per adapter.

`bufferAhead` must come from the buffered range **containing** the playhead, not
the last range. After a seek across a gap the buffer is a set of disjoint
islands, and the final island may be nowhere near the playhead.

## What adapters must not do

- Enumerate streams or describe them to core.
- Compute `externalId` or any other identity.
- Translate between the player's timeline and the manifest's.
- Tell core which variant is active — it follows from the requested segment.
- Tell core whether the stream is live — it follows from the manifest.

## Supported players

### hls.js

- Parsers: HLS only.
- Manifest: `pLoader`.
- Segments: `fLoader`, falling back to `config.loader`.
- Playback: the media element.

The adapter also tunes hls.js's own buffering, because the core's background
loader is what should fetch ahead, not the player. Every setting below is
applied only when the integrator has not configured it, and each is applied
once per value when a playlist loads; between playlists hls.js is left alone.

- **Forward buffer.** `maxBufferLength` is held to the high-demand window. The
  segments beyond it are the core's to prefetch.
- **Position in the live window.** Every segment between the player's buffer
  and the live edge is one peers can fetch for each other, so the player is
  placed as deep in the window as it can go: the target latency, set through
  hls.js's `targetLatency` API, is the window length less one segment, and
  never more than a minute. The player's own forward buffer is what keeps it
  safe there — the fetch positions sit a buffer length ahead of the playhead,
  well inside the window, even as jitter carries the playhead a few seconds
  past the tail. `liveMaxLatencyDuration` is set two segments beyond the
  target: a viewer who pauses or stalls that far is re-synced to the target
  before the buffer starves, a controlled skip in place of a stall and jump.
  Segment length is the playlist's average, not `EXT-X-TARGETDURATION`, which
  is an upper bound and on some streams several times the real segment.
- **Low-latency mode off.** hls.js enables it by default; on a low-latency
  playlist it then requests partial segments, which the core deliberately does
  not register ([architecture.md](architecture.md)), so those requests would
  bypass P2P. The mixin passes `lowLatencyMode: false` unless the integrator
  sets it; an integration that constructs hls.js itself should do the same.

**Hosted in video.js 10.** v10 has no streaming layer of its own; its
`HlsJsAdapter` constructs hls.js from `source.engine.hlsJs`, handed to hls.js
untouched, and exposes the instance as a read-only `engine`. The whole
integration is two calls, with nothing added to this package:
`getConfigForHlsJs()` spread into `source.engine.hlsJs`, and
`bindHls(() => adapter.engine)` — a getter, resolved when hls.js constructs
the playlist loader, by which time the adapter has its instance. Playback
should be pinned to MSE (`preferPlayback`): native HLS on Safari would bypass
hls.js and with it the core. The demo's `videojs10_hls` player is this.

These settings steer only where hls.js starts and re-syncs; where the player
then puts itself is its own business. An immediate quality switch
(`hls.currentLevel`) flushes the buffer and resumes at its former end, which
moves the playhead a buffer length towards the live edge and can leave no
window ahead of it for peers until the player drifts behind again; a switch at
the next fragment (`hls.nextLevel`) keeps the position. An integration that
cares about sharing on live streams should prefer the latter.

### Shaka Player

- Parsers: HLS and DASH — Shaka plays both.
- Manifest: a scheme plugin, filtering on `RequestType.MANIFEST`.
- Segments: the same plugin, filtering on `RequestType.SEGMENT`. A segment
  request the core recognises as a stream's external index is let through to
  Shaka's own loader and its response handed to `processSegmentIndex`.
- Playback: the media element.

A served segment's response carries the download time Shaka's bandwidth
estimator expects, derived from the core's bandwidth hint as
`bytes × 8000 / bandwidth` milliseconds — wall-clock time is meaningless for a
segment that came from a peer or from storage — and never less than 1 ms.
Shaka weights each sample by its duration and divides bytes by it; a 0 ms
sample is infinity at zero weight, which its moving average turns into `NaN`,
after which every variant comparison is false and the player lurches between
renditions. A decoder that cannot switch mid-stream then fails with a decode
error, which is how the defect surfaced on a Smart TV.

Whatever the plugin does not serve itself goes to the http plugin Shaka would
have chosen for this browser: `HttpFetchPlugin` where
`HttpFetchPlugin.isSupported()` — `fetch` and `AbortController` both present —
and `HttpXHRPlugin` otherwise. Old Smart TV browsers have `fetch` without
`AbortController`; forcing the fetch plugin there throws inside Shaka on the
first request, before anything plays, and the IIFE bundle exists for exactly
those browsers.

No manifest-parser decoration and no `segmentIndex` hooking. Shaka's internal
representation of the stream is not consulted.

The adapter places the player in a live window by the same rule as the hls.js
adapter — as deep as the window allows, one segment inside the tail, never more
than a minute behind the edge — through Shaka's `defaultPresentationDelay`,
and only when the integrator has left Shaka's default in place. Shaka reads the
delay when it builds its timeline, so the value must be known before Shaka
parses the manifest: `processManifest` returns what the core read from it, the
adapter derives the delay from the widest live main stream, and it is
configured in the same continuation that handed the manifest to the core, ahead
of Shaka's own parser. It is re-applied only when the window changes by half a
segment or more. Shaka's buffering goal then leaves the rest of the window
ahead of the buffer for peers, and Shaka's own out-of-window handling — a seek
to the window start plus its safe seek offset — covers a playhead that drifts
past the tail, so no re-sync setting is needed. The MPD's suggested delay is
ignored for the same reason hls.js's hold-back is overridden: a server's
suggestion places the player near the edge, where there is nothing to share.

### dash.js

- Parsers: DASH only.
- Manifest and segments: the player's `XHRLoader`, replaced per player through
  `player.extend("XHRLoader", extension, true)` before the player's first
  request — `initialize()` alone makes none; `attachSource()` does.
  dash.js's `FactoryMaker` resolves the override when `HTTPLoader` first
  instantiates the loader, so it applies even though `HTTPLoader` imports the
  loader module directly; with `override` set it builds the real loader, calls
  the extension with it as `this.parent`, and takes only `load` and `abort`
  from what the extension returns. Every request dash.js makes over HTTP —
  MPD, initialization, media and index segments, licences — arrives at that
  `load`, told apart by the type of the `FragmentRequest` behind it.
- Playback: the media element, from `STREAM_INITIALIZED` on.

An MPD request goes to dash.js's own loader with its completion wrapped, so the
core reads the bytes before dash.js parses them. A media segment the registry
knows, on a stream with P2P enabled, is served by the core: the adapter fills
the response dash.js's `HTTPLoader` reads and emits two progress events, the
first at zero bytes and the second at the full length with a `time` equal to
the core's bandwidth hint — dash.js measures throughput from progress traces,
dropping the first as latency and taking the download time from the rest, and
`time` on the event replaces the wall clock, which says nothing about the
network for a segment that came from a peer or from storage. A segment request
the core recognises as a stream's external index is let through and its
response handed to `processSegmentIndex`. Everything else — initialization
segments, licences, certificates, steering, XLink — passes through untouched.
A core failure is reported as a failed response so dash.js's own retry rules
run; an abort from dash.js aborts the core request.

**Hosted in video.js 10.** v10's `DashAdapter` creates its dash.js player and
calls `initialize()` in its constructor, and attaches a source only when one
is set, so `bindPlayer(adapter.engine)` fits between the two with nothing
added to this package. It must be bound exactly once per player: dash.js
keeps the loader it first resolved, so a second engine bound to the same
player never sees a request — under React StrictMode's simulated remount
that is the binding to get right. The demo's `videojs10_dashjs` player is
this.

`FetchLoader` is left unhooked. dash.js routes a request to it only when
`availabilityTimeComplete === false`, so low-latency DASH falls through to the
player's own loading — the low-latency exclusion in
[architecture.md](architecture.md) at no cost.

Live streams: where the integrator left `streaming.delay.liveDelay` at dash.js's
default, the adapter places the player in the window, re-applied only when the
window changes by half a segment. Placement is two settings, not one.

- **Position in the live window.** `streaming.delay.liveDelay` is the window
  less one segment, at most a minute behind the edge — the hls.js and Shaka
  rule, from the same `liveDelayFor` the Shaka adapter uses — and
  `useSuggestedPresentationDelay` is turned off, because a server's suggestion
  places the player near the edge where there is nothing to share.
- **Forward buffer.** `bufferTimeDefault`, `bufferTimeAtTopQuality` and
  `bufferTimeAtTopQualityLongForm` are held to the high-demand window, never
  closer to the live edge than one segment and never below two segments. The
  segments beyond it are the core's to prefetch.

The second is not a refinement of the first. A live delay places the
**playhead**; what the player fetches is a forward buffer ahead of it, and
dash.js left alone buffers `bufferTimeAtTopQualityLongForm` — a minute, since
a dynamic stream is long-form by its duration — which on a typical window is
the whole of it. The playhead then sits a delay behind the edge while the fetch
position rides the edge itself, where the registry cannot yet know the segment:
core learns of a segment when dash.js refreshes the MPD, while dash.js derives
availability from its own clock, synced to the MPD's `UTCTiming`. Every such
request misses the registry and goes to dash.js's own loader, so the stream
plays perfectly and shares nothing — visible as a stream that stops sharing
minutes in and resumes only when the player falls behind the edge again.
Each of the three settings is a ceiling: one the integrator already holds
lower is left alone.

### video.js

- Parsers: HLS and DASH — video.js plays both through VHS
  (`@videojs/http-streaming`), which is built on the same `m3u8-parser` and
  `mpd-parser` the core uses, so a video.js integration and the core interpret
  a manifest through identical code.
- Manifest and segments: `videojs.Vhs.xhr`, replaced once per page by
  `VideoJsP2PEngine.registerPlugins(videojs)`. VHS routes every request of
  every player — playlists, MPDs, media and initialization segments, keys,
  `sidx` — through a per-player xhr function that runs the player's and the
  global `onRequest` hooks and then calls `videojs.Vhs.xhr` whenever its
  `original` flag is not `true`. The replacement carries the original's hook
  registry over (`onRequest`, `onResponse`, their `off` counterparts and the
  callback sets), since VHS reads them off `videojs.Vhs.xhr`. Requests are told
  apart by VHS's `requestType`.
- Playback: the media element behind `player.tech()`.

Attributing a request to a player: each bound engine adds an `onRequest` hook
to its player's VHS xhr that tags the options with the engine. The first
manifest request of a source fires synchronously inside VHS's source handler,
before any hook can be attached, so an untagged request is matched to a bound
player by its `currentSrc()` and that player's hook is attached on the spot;
an untagged request no player claims goes to `videojs.xhr` untouched. A
change of `currentSrc()` between manifest requests starts a new stream
context; a playlist or MPD refresh does not.

Playlists and MPDs pass through to `videojs.xhr` with the completion wrapped,
so the core reads the bytes — under the response URL, which follows redirects
— before VHS parses them. A media segment the registry knows, on a stream with
P2P enabled, is served by the core: the object handed back to VHS carries the
data, a 200 status and a preset `bandwidth`, which VHS's callback wrapper keeps
instead of measuring one from the wall clock — meaningless for a segment that
came from a peer or from storage. A `sidx` request passes through and its
bytes go to `processSegmentIndex`. Initialization segments, keys, content
steering and clock sync pass through untouched. An abort from VHS aborts the
core request and completes as aborted; a core failure completes as an errored
request, which VHS retries by its own rules.

VHS exposes no presentation-delay setting comparable to the other engines': it
starts a live stream at its own seekable end, honouring `EXT-X-START` and
`HOLD-BACK` where present. The adapter leaves that placement alone.

**On Safari and iOS there is nothing to intercept** unless the integrator opts
into `overrideNative`: VHS stands aside by default there — `overrideNative`
defaults to `!(IS_ANY_SAFARI || IS_IOS)` — so HLS plays natively through the
media element and no request passes through `videojs.Vhs.xhr`. Opting in
requires MSE and alters playback behaviour on exactly those platforms.

## Players the boundary is drawn to accommodate

No adapter for these lives in this repository. They are recorded because the
three responsibilities above were chosen so that adding them requires nothing
beyond those three — a boundary that only fits the players already behind it has
not been tested, and each of these exercises a different part of it.

### Native players

ExoPlayer and AVPlayer reach core through a local HTTP proxy rather than an
in-process adapter. That proxy is a separate project in its own repository;
what belongs here is the shape core must present to it, which is the same three
responsibilities. It is the case that motivates the playback contract carrying
no absolute position, since the proxy and the player are in different processes.
See [mobile-proxy.md](mobile-proxy.md).
