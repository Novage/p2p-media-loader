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

- **Cross-player swarms.** Segment identity is derived from the manifest — the
  HLS media sequence number, or the DASH presentation time in 100 ms units — so
  an HLS.js peer, a Shaka peer and a Video.js peer on the same rendition of the
  same stream exchange segments. A rendition is still a swarm: engines left on
  their own adaptive logic may sit in different ones.
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
- **Shaka Player 4.3 and later** as well as 5. The adapter uses only the
  networking plugin API, which both share.

### Changed

- **Segment requests are addressed by URL and byte range**, not by a runtime
  identifier the integration composed. `loadSegment(url, { byteRange?, signal? })`
  returns a promise; `hasSegment`, `isSegmentLoadable` and `abortSegmentLoading`
  take the same pair.
- **Playback is reported as `{ bufferAhead, rate }`** rather than an absolute
  position. The core keeps its own estimate of the playhead and re-anchors it on
  each report; see [`specs/playback-contract.md`](specs/playback-contract.md).
- **A live player is placed as deep in the live window as the window allows**,
  by one rule shared across the adapters, so the segments between a peer's
  buffer and the live edge are as many as possible for peers to exchange.
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
  playlists register nothing when they arrive — Shaka and Video.js hand them
  over like any other — and a playlist declaring `EXT-X-I-FRAMES-ONLY` needs
  no master to be ignored. An MPD's text, thumbnail and trick-mode
  `AdaptationSet`s are left out where it is read. Leaving a trick-mode set out
  also changes the identity of a video rung it matched in codecs and
  resolution — `bitrate` no longer has to tell the two apart — so on such an
  MPD, 5.0.0-alpha peers sit in a different swarm. The protocol stays `v3`: a
  pre-release is not a compatibility target ([`AGENTS.md`](AGENTS.md), "The
  peer protocol is a contract"). See
  [`specs/manifest-registry.md`](specs/manifest-registry.md).
- **HLS alternate video renditions are declared streams.** An
  `EXT-X-MEDIA TYPE=VIDEO` rendition with a playlist of its own — a camera
  angle, which Shaka plays — registers as a main stream identified by its
  variant's attributes and its own `NAME`, and is shared. It used to register
  anonymously when its playlist arrived, and never shared. Variants' identity
  is unchanged. See [`specs/segment-identity.md`](specs/segment-identity.md).

### Removed

- `Core.addStreamIfNoneExists`, `updateStream`, `getStreamSegmentRuntimeIds`,
  `setIsLive` and `setActiveLevelBitrate` — streams, segments and liveness all
  come from the manifest now. `setManifestResponseUrl` is optional: the first
  manifest names the swarm.
- The `Core<TStream>` generic, `StreamRegistration` and `EngineCallbacks`.
- The `p2pml:core-as-bundle` export condition, which existed to spare consumers
  a `bittorrent-tracker` dependency and Node polyfills that the core no longer
  has.
- A deprecated tracker from the default announce list. The defaults are
  `wss://tracker.webtorrent.dev` and `wss://tracker.openwebtorrent.com`.

### Fixed

These predate 5.0.0 and affect 4.x deployments as well.

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

## 4.0.0

Stream identity derivation moved from the player integrations into the core.
Integrations pass raw stream properties and the core computes the identity
values once per stream, freezing them on the `Stream` object. The default
derivation is bit-identical to 3.x — enforced by golden-vector tests — so
default-config 4.x peers keep sharing swarms with 3.x peers, and no infohash
changes unless `streamSwarmIdBuilder` is configured.
