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
recognises that request and hands the bytes to core. It is not a media segment
and will not resolve against the registry, so it needs recognising, not
looking up. See [manifest-registry.md](manifest-registry.md).

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

**Handle manifest and segment requests only, and pass every other type through
untouched.** Licence, key, certificate, timing and steering requests belong to
the player. This is a whitelist by design — the set of request types a player
emits grows over time, and an exclusion list is wrong after the next release.
See [encryption.md](encryption.md).

Two details adapters routinely get wrong:

- **Byte ranges must round-trip exactly.** A segment defined by
  `EXT-X-BYTERANGE` is identified by URL _and_ range; dropping the range
  collides distinct segments.
- **Returned buffers may be transferred.** Players that hand data to a worker
  for transmuxing detach the `ArrayBuffer`. Clone before yielding it, or core's
  cached copy is destroyed and cannot be seeded to peers.

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

### Shaka Player

- Parsers: HLS and DASH — Shaka plays both.
- Manifest: a scheme plugin, filtering on `RequestType.MANIFEST`.
- Segments: the same plugin, filtering on `RequestType.SEGMENT`.
- Playback: the media element.

No manifest-parser decoration and no `segmentIndex` hooking. Shaka's internal
representation of the stream is not consulted.

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

### dash.js

Each responsibility has a known home:

- Manifest and segments: `player.extend("XHRLoader", …)`. The override resolves
  through dash.js's `FactoryMaker` at instantiation, so it applies even though
  `HTTPLoader` imports the loader module directly. Manifest and segment requests
  both arrive there, distinguished by `request.type` — as do `SegmentBase` index
  fetches, under their own `INDEX_SEGMENT_TYPE`, which the adapter observes and
  forwards rather than serves.
- Playback: the media element.
- Parsers: DASH only.

`FetchLoader` would be left unhooked. dash.js routes a request to it only when
`availabilityTimeComplete === false`, so low-latency DASH falls through to the
player's own loading — matching the low-latency exclusion in
[architecture.md](architecture.md) at no cost.

Note that DASH support is itself incomplete independently of any adapter:
`SegmentBase` streams have no segment list in the manifest. See
[manifest-registry.md](manifest-registry.md).

### video.js

video.js is a UI framework rather than a playback engine. In practice that
engine is VHS (`@videojs/http-streaming`), bundled since video.js 7 — the
plugins that routed video.js through hls.js instead are no longer maintained,
and the most recent of them is published as deprecated, so VHS is the only path
worth designing for.

- **The hook is `videojs.Vhs.xhr`**, which VHS consults for every request,
  manifest and segment alike. It falls back to its own implementation only
  while `videojs.Vhs.xhr.original === true`, so assigning a replacement takes
  over loading entirely. Byte ranges arrive as a `Range` header rather than in
  the URL.
- **Playback state** is the media element behind `player.tech()`.

**On Safari and iOS there is nothing to intercept.** VHS stands aside by
default — `overrideNative` defaults to `!(IS_ANY_SAFARI || IS_IOS)` — so HLS
plays natively through the media element and no request passes through
`videojs.Vhs.xhr`. No adapter can change this; only the integrator can, by
opting into `overrideNative`, which requires MSE and alters playback behaviour
on exactly those platforms. Since the hls.js plugin route is gone, there is no
alternative engine to fall back to either.

VHS is also why the parser choice in [packaging.md](packaging.md) is worth
stating explicitly: VHS is built on `m3u8-parser` and `mpd-parser`, the same
libraries core parses with. A video.js integration and core would interpret a
manifest through identical code — the strongest available form of the agreement
that [segment-identity.md](segment-identity.md) depends on.
