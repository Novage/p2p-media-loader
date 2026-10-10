# Changelog

Upgrade steps for each major version live in [MIGRATION.md](MIGRATION.md); this
file records what changed and why. Releases before 4.0.0 are listed under
[GitHub releases](https://github.com/Novage/p2p-media-loader/releases).

## 5.0.0

The core parses HLS and MPEG-DASH manifests itself. A player integration no
longer describes streams and segments to the core: it hands over every manifest
the player fetches, routes segment requests through the core, and reports
playback state. Identity follows from the manifest rather than from whatever
each integration composed, so peers on different players share one swarm. The
design is written down in [`specs/`](specs/).

**Wire compatibility: none with 4.x.** The peer protocol is `v3`, and 5.x peers
form separate swarms from 4.x peers. Roll a deployment over in one step; mixed
versions do not exchange segments, and every stream still plays over HTTP
throughout.

### Added

- **Smaller bundles for integrators who bundle the npm packages.** The core
  exports `p2p-media-loader-core/shims/xmldom`, the browser's `DOMParser`, to
  alias `@xmldom/xmldom` to in a browser build: about 25 KB gzipped less for
  MPEG-DASH. Defining `__P2PML_DIAGNOSTICS__` as `false` removes the
  diagnostics ledger, about 1.4 KB more. The README's "Reduce the Bundle Size"
  shows both for Vite and webpack; the prebuilt bundles already include them.
- **Identity is computed in the core, from the manifest** — the HLS media
  sequence number, or the DASH presentation time in 100 ms units — rather than
  by each integration out of what its player exposes. Peers on different
  players derive the same identity for the same segment, so a swarm shared
  between players holds in practice. A rendition is still a swarm: engines left
  on their own adaptive logic may sit in different ones.
- **The HLS.js and Shaka integrations need much less of their players' APIs.**
  Neither describes streams or segments any more, so neither decorates a
  manifest parser nor reads its player's internal representation of the stream.
  That reduction is what made the dash.js and Video.js adapters below
  straightforward to write.
- **`p2p-media-loader-dashjs`.** dash.js gets an adapter of its own.
  `bindPlayer(player)` before `player.initialize()`.
- **`p2p-media-loader-videojs`.** Video.js 8 plays both protocols through VHS;
  the adapter attaches per player through that player's own request hooks, with
  an optional `p2pMediaLoader` plugin for integrators who prefer that style.
  Video.js 10 needs no package of ours — it plays through HLS.js and dash.js
  media adapters, which the existing integrations drive directly.
- **DASH `SegmentBase`.** The segment list lives in a `sidx` box inside the
  media file; the core recognises the index request and reads the box out of
  the response the player already fetched, so these streams share like any
  other. WebM representations index with an EBML `Cues` element, which the core
  does not read; they play without P2P.
- **DASH live streams numbered from the clock share up to the live edge.** For
  an MPD whose `SegmentTemplate@duration` numbers segments from the wall clock,
  the core synchronizes with the MPD's `UTCTiming` server, as the players do,
  and lists each new segment when it becomes available rather than at the next
  MPD refresh. A player that asks for the newest segment the moment it exists —
  dash.js does for audio — gets it through the core, and the list holds on a
  device whose clock is wrong. The same applies to a `SegmentTimeline` that
  repeats its last entry until the present (`S@r` < 0) under a `$Number$`
  template; its list now ends at the last segment that has ended, where it
  reached up to one `minimumUpdatePeriod` ahead, so the live window that
  `processManifest` reports is shorter by as much. The core asks the MPD's time
  servers in order until one answers, once for each source it plays. When none
  answers, it keeps the local clock and asks again at most once a minute. See
  [`specs/manifest-registry.md`](specs/manifest-registry.md), "Segments computed
  from the clock".
- **One peer is elected to fetch each new live segment over HTTP** and the rest
  take it from that peer. Each scores itself and its neighbours with a hash of
  peer id and segment id, so the choice needs nothing on the wire; the ranked
  others step in only when the owner is late enough to threaten playback. The
  random timer it replaces cost two peers on one machine about a tenth of their
  traffic to duplicate fetches.
- **New core API**: `processManifest`, `isSegmentIndex`, `processSegmentIndex`,
  `updatePlayback` with `getPlaybackStateFromMediaElement`,
  `byteRangeFromRangeHeader`, `identityProperties`, and the
  `onSegmentRegistryMiss` event for a segment request the registry did not know.
- **Manifest parsers are selected statically**, through
  `CoreConfig.manifestParsers` and the `p2p-media-loader-core/hls` and
  `p2p-media-loader-core/dash` subpaths, so a deployment carries only the
  parsers it uses. Prebuilt bundles follow: `p2p-media-loader-core.es.min.js`
  carries both, `-hls` and `-dash` carry one.

### Changed

- **Segment requests are addressed by URL and byte range**, not by a runtime
  identifier the integration composed. `loadSegment(url, { byteRange?, signal? })`
  returns a promise; `hasSegment`, `isSegmentLoadable` and `abortSegmentLoading`
  take the same pair.
- **Playback is reported as `{ bufferAhead, rate }`** rather than an absolute
  position, and every integration reports it. The core keeps no playhead: the
  segment a player requested last is its position, and the reported buffer
  decides whether that request is urgent. A player that never reports is taken
  as one with nothing buffered. See
  [`specs/playback-contract.md`](specs/playback-contract.md).
- **Only a player's own request is urgent.** A request is fetched over HTTP at
  once when the player's buffer is below `urgentBufferThreshold`; with more
  buffer, it waits for a peer while the buffer drains. In 4.x every segment
  within the high-demand window ahead of the playhead was fetched over HTTP,
  whether the player had asked for it or not. A player with P2P is now never
  slower than without it, on the same player parameters, and never faster at
  the cost of HTTP bytes. The core needs no seek detection: after a seek, the
  player's first request at the new place is urgent because its buffer is
  empty there, and nothing at the place it left is urgent. Backups in the
  prefetch election act only on the segment their own player has requested.
  See [`specs/playback-contract.md`](specs/playback-contract.md), "Urgency",
  and [`specs/prefetch.md`](specs/prefetch.md), "Backups".
- **A live player is placed as deep in the live window as the window allows**,
  by one rule shared across the adapters, so the segments between a peer's
  buffer and the live edge are as many as possible for peers to exchange.
  Video.js 8 has no setting for this, so its adapter writes the delay into the
  manifest VHS parsed and caps that player's buffer goal: on 2 s DASH segments
  two Video.js peers went from sharing nothing to sharing segments both ways. On
  HLS.js and dash.js, a viewer that a pause or a stall leaves more than two
  segments past that placement is brought back to it — through the latency limit
  the adapter sets on HLS.js, and when playback resumes on dash.js — so the
  player keeps fetching segments its peers still hold, rather than playing on
  behind the window over HTTP alone until it stalls. On a DVR window wider than
  that, a viewer who rewound into the window stays where they chose, and is
  brought back only once a pause carries them out of it.
- **`highDemandTimeWindow` is renamed `urgentBufferThreshold`, and is optional
  and derived on live.** Left unset, VOD keeps 15 s and a live stream gets half
  of what the player buffers — at least a segment, at most 15 s — from the live
  window's geometry, so the other half of the buffer is room for the prefetch
  election. Off live a number is still the threshold; on live it is a ceiling,
  since nothing configured here widens the player's buffer and a threshold
  past half of it would make every request urgent. The adapters size the
  player's forward buffer one segment short of the live delay rather than to
  the urgency threshold, on hls.js, dash.js and
  Shaka alike, and hls.js tunes a four-segment playlist, the narrowest with
  room in it. On a four-segment live playlist, where the delay, the window and
  the buffer all measured 15 s, two peers pulled 1.68 copies of each segment
  from the origin and no election ever ran. The memory storage keeps three
  trailing segments on live, under a floor of 15 s, instead of the window's
  length. See [`specs/playback-contract.md`](specs/playback-contract.md), "The
  urgency threshold".
- **Segment storage is told when a live window moves past segments**, through
  the optional `SegmentStorage.onSegmentsRemoved`, and the memory storage drops
  them at once. Nothing can request such a segment again. A paused live player
  keeps fetching its share for its peers, as the election needs, and its
  storage kept every segment after its frozen position: on one stream with one
  peer, 9.5 MiB in a 45 s pause, bounded only by the storage brake. It is now
  bounded by the live window. The storage is also told each stream type's
  position, as a third argument of `onPlaybackUpdated`, and the memory storage
  judges each segment by its own type's position. See
  [`specs/playback-contract.md`](specs/playback-contract.md), "What the segment
  store receives".
- **`bitrate` enters a stream's identity only where a manifest needs it** to
  tell two same-type streams apart. An origin that recomputes `BANDWIDTH` per
  request no longer splits a rendition's swarm.
- **ESM bundles of the engine packages import the core and its parsers by bare
  specifier.** A page's import map needs an entry for each, all pointing at one
  core bundle; a missing entry fails at module resolution rather than silently.
  See [`specs/packaging.md`](specs/packaging.md).
- `ShakaP2PEngine.registerPlugins` registers only the networking schemes.
  Shaka's own manifest parsers are no longer replaced. Calls are counted, and
  `unregisterPlugins` hands the schemes back to Shaka's own plugins when the
  last call is matched — two players on a page each registering on mount keep
  P2P until the second leaves. `bindShakaPlayer` throws when no registration
  is in effect; register before binding.
- **Every engine's `destroy()` runs each teardown step whatever the others
  made of themselves, and raises the first failure once it is done.** A
  segment storage supplied through `customSegmentStorageFactory` that throws
  from its own teardown now surfaces from `destroy()` rather than being lost;
  a call that expected `destroy()` never to throw should be prepared for it.
- Shaka's `player.preload()` is not supported. A preloaded manifest is fetched
  under the source that is playing and read into that source's core, which the
  `load()` of the preloaded source then tears down — and Shaka does not fetch
  the manifest again, so the new source plays without P2P. Call `load(uri)`
  directly.
- A media playlist processed before its master is not supported. A stream's
  identity and type are fixed by the first manifest that registers it; a
  master arriving afterwards attaches its declaration to the anonymous stream
  but does not identify it, and the stream shares only while it is alone of
  its type. No player produces this order — the master is the first manifest a
  player fetches — so it concerns only code calling `Core.processManifest`
  directly. See [`specs/manifest-registry.md`](specs/manifest-registry.md).
- `Stream.runtimeId` is the manifest-derived stream key: the media playlist URL
  for HLS, the Representation id for DASH.
- **The core registers video and audio streams only**, by what the manifests
  declare, so no adapter has to tell a track's kind. An HLS master's subtitle
  renditions and I-frame playlists are remembered by URL and their media
  playlists register nothing when they arrive — every adapter hands them over
  like any other — and a playlist declaring `EXT-X-I-FRAMES-ONLY` needs no
  master to be ignored. An MPD's text, thumbnail and trick-mode
  `AdaptationSet`s are left out where it is read. The segments of subtitles
  and trick play are still recognised, so a player's request for one loads
  over HTTP without counting as a registry miss. Leaving a trick-mode set out
  also changes the identity of a video rung it matched in codecs and
  resolution, since `bitrate` no longer has to tell the two apart. See
  [`specs/manifest-registry.md`](specs/manifest-registry.md).
- **HLS alternate video renditions are declared streams.** An
  `EXT-X-MEDIA TYPE=VIDEO` rendition with a playlist of its own — a camera
  angle, which Shaka plays — registers as a main stream identified by its
  variant's attributes and its own `NAME`, and is shared. It used to register
  anonymously when its playlist arrived, and never shared. Variants' identity
  is unchanged. See [`specs/segment-identity.md`](specs/segment-identity.md).

- **The Shaka engine turns Shaka's own segment prefetch off**
  (`streaming.segmentPrefetchLimit` 0 on a Shaka that has it) and gives it back
  on `destroy()`. Shaka 5 asks for the next segment while the one it needs is
  still loading; the core serves one request for each stream, so the second
  aborted the first. At rate 2 on DASH this stopped playback for good. The
  core prefetches for the player anyway. Only an abort Shaka asked for is
  reported to it as an abort, which it never retries; one the core made is a
  network error, which Shaka's retry parameters govern. See
  [`specs/player-adapters.md`](specs/player-adapters.md).

### Removed

- `Core.addStreamIfNoneExists`, `updateStream`, `getStreamSegmentRuntimeIds`,
  `setIsLive` and `setActiveLevelBitrate` — streams, segments and liveness all
  come from the manifest now. `setManifestResponseUrl` is optional: the first
  manifest names the swarm.
- The `Core<TStream>` generic, `StreamRegistration` and `EngineCallbacks`.
- The `p2pml:core-as-bundle` export condition, which existed to spare consumers
  a `bittorrent-tracker` dependency and Node polyfills that the core no longer
  has.
- The Plyr and Vidstack examples, from the demo and the API documentation. Both
  players are deprecated in favour of Video.js 10, which the demo and the
  documentation cover with HLS.js and dash.js. The demo's IndexedDB storage
  example now runs on plain HLS.js.

### Fixed

These predate 5.0.0 and affect 4.x deployments as well.

- An HTTP download that waited more than 3 s for the response's headers was
  aborted as stalled: `httpNotReceivingBytesTimeoutMs` ran from the start of
  the request and counted body bytes only. A slow network, a new connection
  or a CDN filling its cache can take that long, and the aborts could keep a
  player from starting. That timeout now runs from the headers, and the wait
  for them has a limit of its own, `httpFirstByteTimeoutMs`, 10 s by default.
- The bandwidth reported to the player was measured between the chunks of a
  download, which left out the wait for each response, and read a segment
  that arrived in one burst as gigabits per second. The player's adaptive
  bitrate logic then took a rendition the network could not carry: dash.js
  asked for 4K after its first segment and stalled on it. Bandwidth is now
  measured per download, from the request to the last byte, and downloads
  that run side by side are counted by their total.
- With HLS.js 1.6, a live player started three target durations from the
  edge, HLS.js's default, and stayed there with nothing to share. The
  engine set its live delay after HLS.js had read the playlist and picked
  its start, which 1.6 keeps. The delay is now set before HLS.js reads the
  playlist. Video.js 10.0.1 ships HLS.js 1.6.7, and played the USP DVR
  stream 10 s from the edge with no P2P.
- A tracker that accepted a connection and closed it at once was answered with
  a reconnect every second indefinitely, each carrying an announce and a batch
  of offers. The backoff is now cleared by a connection that lasted.
- A peer that stopped reading while holding its data channel open left the
  upload unsettled for good, so that peer read as uploading forever, was exempt
  from churn cleanup, and rejected every later upload. A send that makes no
  progress now gives up.
- The buffer handed to a player was the one segment storage kept. Players that
  transfer it to a transmuxing worker — HLS.js and Video.js's VHS both do —
  detached it, after which that peer announced the segment and uploaded
  nothing, and every peer that took the empty copy re-served it in turn: one
  viewer could empty a swarm while every stream kept playing. The core now
  copies once, where bytes leave it, and refuses a zero-length segment at every
  boundary.
- Segment storage measured occupancy by a different rule than the one that
  frees it, so the brake on prefetching engaged late on live streams; and a
  re-stored segment was counted twice, which evicted while capacity was free.
- A quality switch made before anything was stored closed the tracker
  connection and opened a new one: the outgoing stream's loader was let go
  before the incoming one held the shared socket, so on a stream with no
  separate audio the socket's last holder released it. That is a player
  settling on a rendition at startup, and each such switch cost a TLS handshake
  per tracker before the new swarm could be announced. The next loader now
  takes the socket first, and one that fails to build leaves the previous loader
  current rather than destroyed.
- Two peers that joined a swarm at the same moment — two viewers starting
  together, or settling on the same rendition after a quality switch — could
  each answer the other's offer and then refuse the answer to its own, so
  neither connection completed and the peers stayed apart until the tracker's
  next announce, minutes later. Both now keep the handshake offered by the
  peer with the lower peer id.
- A peer that answered an offer started its connection timeout when it sent
  the answer, before the tracker delivered it to the other peer. The peer that
  made the offer started only when the answer arrived. A slow tracker thus made
  the answering peer give up first, while the connection was still forming.
  The answering peer now waits 5 seconds more than `webRtcConnectionTimeoutMs`.

## 4.0.0

Stream identity derivation moved from the player integrations into the core.
Integrations pass raw stream properties and the core computes the identity
values once per stream, freezing them on the `Stream` object. The default
derivation is bit-identical to 3.x — enforced by golden-vector tests — so
default-config 4.x peers keep sharing swarms with 3.x peers, and no infohash
changes unless `streamSwarmIdBuilder` is configured.
