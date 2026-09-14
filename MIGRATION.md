# Migration Guide

## v4 → v5

v5 makes the core parse HLS and MPEG-DASH manifests itself. A player
integration no longer describes streams or segments to the core: it hands the
core every manifest the player fetches, routes segment requests through it, and
reports playback state. Segment identity is derived from the manifest, so
peers on different players share one swarm. The design is documented in
`specs/`.

**Wire compatibility:** none with v4. `externalId` is now the HLS media
sequence number or the DASH presentation time in 100 ms units, and
`identityHash` hashes the manifest's properties as written — the v4
normalization is gone, and `bitrate` counts only where a manifest needs it to
tell two same-type streams apart, so an origin that recomputes `BANDWIDTH` per
request no longer splits a rendition's swarm. The peer protocol version is
`v3` and v5 peers form separate swarms from v4 peers.
Roll a deployment over in one step; mixed versions do not exchange segments,
and every stream still plays over HTTP.

### Bundled engines

`p2p-media-loader-hlsjs` and `p2p-media-loader-shaka` keep their public API.
`ShakaP2PEngine.registerPlugins` now registers only the networking schemes;
Shaka's own manifest parsers are no longer replaced. npm and IIFE consumers
have nothing to change. `p2p-media-loader-shaka` works with Shaka Player 4.3
and later as well as 5 — the adapter uses only the networking plugin API,
which both share — and, as before, declares no peer dependency on it.

**ESM bundles from a CDN need two or three more import map entries.** The
engine's `dist/*.es.js` imports the core _and_ its manifest parsers by bare
specifier; map every one of them to the same core bundle, the one carrying the
parsers the engine needs:

```json
{
  "imports": {
    "p2p-media-loader-core": "https://cdn.jsdelivr.net/npm/p2p-media-loader-core@^5/dist/p2p-media-loader-core-hls.es.min.js",
    "p2p-media-loader-core/hls": "https://cdn.jsdelivr.net/npm/p2p-media-loader-core@^5/dist/p2p-media-loader-core-hls.es.min.js",
    "p2p-media-loader-hlsjs": "https://cdn.jsdelivr.net/npm/p2p-media-loader-hlsjs@^5/dist/p2p-media-loader-hlsjs.es.min.js"
  }
}
```

For Shaka map `p2p-media-loader-core`, `p2p-media-loader-core/hls` and
`p2p-media-loader-core/dash` to `p2p-media-loader-core.es.min.js`, which
carries both parsers. A missing entry fails at module resolution rather than
silently; see `specs/packaging.md`.

DASH `SegmentBase` streams keep their segment list in a `sidx` box inside the
media file; the core reads it from the response the player fetches, so these
streams share like any other. WebM representations index with an EBML `Cues`
element instead, which the core does not read; they play without P2P.

### Custom integrations

A custom integration must supply the manifest parsers for the protocols its
player plays and hand every manifest response to the core:

```typescript
import { Core } from "p2p-media-loader-core";
import { hlsManifestParser } from "p2p-media-loader-core/hls";
import { dashManifestParser } from "p2p-media-loader-core/dash";

const core = new Core({
  manifestParsers: [hlsManifestParser, dashManifestParser],
});

// in the player's manifest loader, for every response:
core.processManifest({ url: response.url, data: response.data });
```

Segment requests are resolved by URL and byte range rather than by a
runtime identifier the integration composed:

```typescript
// v4
const id = byteRange ? `${url}|${byteRange.start}-${byteRange.end}` : url;
if (core.hasSegment(id) && core.isSegmentLoadable(id)) {
  core.loadSegment(id, { onSuccess, onError });
}

// v5
if (core.isSegmentLoadable(url, byteRange)) {
  const { data, bandwidth } = await core.loadSegment(url, {
    byteRange,
    signal,
  });
}
```

Playback is reported as `{ bufferAhead, rate }` through
`core.updatePlayback(getPlaybackStateFromMediaElement(media))` (see the v4.x
notes below and `specs/playback-contract.md`).

### Removed from `Core`

| v4                                         | v5                                                      |
| ------------------------------------------ | ------------------------------------------------------- |
| `addStreamIfNoneExists(stream)`            | removed — streams come from `processManifest`           |
| `updateStream(id, add, remove)`            | removed — segments come from `processManifest`          |
| `getStreamSegmentRuntimeIds(id)`           | removed                                                 |
| `setIsLive(isLive)`                        | removed — derived from the manifest                     |
| `setActiveLevelBitrate(bitrate)`           | removed — follows from the requested segment            |
| `hasSegment(runtimeId)`                    | `hasSegment(url, byteRange?)`                           |
| `isSegmentLoadable(runtimeId)`             | `isSegmentLoadable(url, byteRange?)`                    |
| `loadSegment(runtimeId, callbacks)`        | `loadSegment(url, { byteRange?, signal? })` → `Promise` |
| `abortSegmentLoading(runtimeId)`           | `abortSegmentLoading(url, byteRange?)`                  |
| `Core<TStream>` generic                    | `Core` — streams carry no integration-specific fields   |
| `StreamRegistration`, `EngineCallbacks`    | removed                                                 |
| `setManifestResponseUrl(url)` _(required)_ | optional — the first manifest names the swarm           |

`Stream.runtimeId` is now the manifest-derived stream key: the media playlist
URL for HLS, the Representation id for DASH. The `onStreamRegistrationError`
event keeps its shape; it fires once per failing stream, only for
`streamSwarmIdBuilder` failures.

### New APIs

- `CoreConfig.manifestParsers` and the `p2p-media-loader-core/hls` and
  `p2p-media-loader-core/dash` subpaths.
- `Core.processManifest({ url, data, protocol? })`, returning what the
  manifest described per stream.
- `Core.isSegmentIndex(url, byteRange?)` and
  `Core.processSegmentIndex({ url, byteRange?, data })` — a DASH
  `SegmentBase` stream's `sidx` index, recognised and read from the response
  the player fetched.
- `onSegmentRegistryMiss` core event — a segment request the registry did not
  know, which the player then loaded itself. Initialization segments are
  recognised and never reported.
- `byteRangeFromRangeHeader(header)` — converts a `Range: bytes=a-b` header to
  the inclusive `ByteRange` the lookup methods take.
- `identityProperties(streams)` — the identity input for every stream a
  manifest declares, with `bitrate` kept only where two same-type streams would
  otherwise be indistinguishable. Exported from the main entry and from
  `p2p-media-loader-core/server`, so a server reproduces the client's choice.
- Bundles: `p2p-media-loader-core.es.min.js` carries both parsers;
  `-hls` and `-dash` variants carry one.

## v3 → v4

v4 moves stream identity derivation from the player integrations into the core.
Integrations pass raw stream properties; the core computes the identity values
once per stream at registration and freezes them on the `Stream` object.

**Wire compatibility:** the default derivation is bit-identical to v3
(enforced by golden-vector tests), so default-config v4 peers keep sharing
swarms with v3 peers. No infohash changes unless you configure the new
`streamSwarmIdBuilder`.

### `Stream` type

`Stream.index` is replaced by `Stream.identityHash`, and streams now carry
their full computed identity:

```typescript
type Stream = {
  runtimeId: string;
  type: StreamType;
  properties: Readonly<StreamProperties>; // raw manifest metadata (NEW)
  swarmId: string; // resolved at registration (NEW)
  identityHash: string; // was `index`
  streamSwarmId: string; // pre-hash swarm string (NEW)
  infoHash: string; // announced to trackers (NEW)
};
```

### `Core.addStreamIfNoneExists`

Custom integrations no longer compute the stream identifier. Pass the raw
properties instead; identity fields are computed by the core:

```typescript
// v3
core.addStreamIfNoneExists({
  runtimeId: url,
  type: "main",
  index: generateStreamShortId({ bitrate, codecs, width, height }),
});

// v4
core.addStreamIfNoneExists({
  runtimeId: url,
  type: "main",
  properties: { bitrate, codecs, width, height },
});
```

Registration requires the swarm ID to be resolvable: either configure
`swarmId` or call `setManifestResponseUrl()` before adding streams.

`addStreamIfNoneExists` never throws. A stream that fails to register — an
unresolvable swarm ID, or an invalid or colliding custom stream swarm ID —
stays unknown to the core (its segments load without P2P), and the failure is
reported via the `onStreamRegistrationError` event.

### Renamed / removed exports

| v3                                             | v4                                                          |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `generateStreamShortId(props)`                 | `computeStreamIdentityHash(properties)`                     |
| `GenerateStreamShortIdProps`                   | `StreamProperties`                                          |
| `Stream.index`                                 | `Stream.identityHash`                                       |
| — (internal `getStreamSwarmId`)                | `computeStreamSwarmId({ swarmId, streamType, properties })` |
| — (internal `getStreamHash`)                   | `computeInfoHash(streamSwarmId)`                            |
| `SegmentLoadDetails.segmentUrl` _(deprecated)_ | removed — use `segment.url`                                 |
| `PartialShakaEngineConfig` (shaka package)     | `PartialShakaP2PEngineConfig`                               |
| `StreamWithSegments`, `SegmentWithStream`      | removed — internal types (see `Core.getStream` below)       |

The event payload types are now composed from shared bases: the segment
events (`SegmentStartDetails`, `SegmentLoadDetails`, `SegmentErrorDetails`,
`SegmentAbortDetails`) extend `SegmentEventDetails`, the peer events extend
`PeerDetails`, and the tracker events extend the new `TrackerEventDetails`.
Their fields are unchanged apart from the `segmentUrl` removal above and the
`trackerUrl` additions listed under "New APIs".

The identity helpers are exported from the main entry and from the Node-safe
`p2p-media-loader-core/server` subpath (Node.js 16+) for server-side
infohash computation. The package is published as ESM only: CommonJS projects
should load it with a dynamic `import()` (or `require()` on Node.js 20.17+).

### New APIs

- `StreamConfig.streamSwarmIdBuilder` — optional callback that builds a custom
  stream swarm ID per stream, making the announced infohash predictable on a server
  (see "Predicting swarm infohashes on a server" in the API documentation).
- `onStreamAdded` core event — fired once per registered stream with its
  computed identity, including `infoHash`. The payload is a snapshot detached
  from the core's internal stream state.
- `onStreamRegistrationError` core event — fired when a stream fails to
  register. Subscribe to surface `streamSwarmIdBuilder` misconfigurations
  (e.g. colliding stream swarm IDs), which are otherwise only visible in
  debug logs.
- `Core.getStreams()` — returns all currently registered streams with their
  computed identities, so the announced infohashes can be listed at any time,
  not just at registration.
- `Core.getStreamSegmentRuntimeIds(streamRuntimeId)` — returns a snapshot set
  of the segment runtime IDs registered for a stream, in registration order.
  Replaces reading `Core.getStream(...).segments`.
- `PeerDetails.trackerUrl` — every peer event payload (`onPeerConnect`,
  `onPeerClose`, `onPeerError`, `onPeerWarning`, `onPeerConnectError`) now
  reports the tracker URL the peer was discovered from.

### `Core.getStream` no longer exposes segments

`Core.getStream()` and `Core.getStreams()` now return detached snapshots of
the plain stream (`TStream`) — its identity fields plus any
integration-specific extensions. The internal segment registry
(`StreamWithSegments`, `SegmentWithStream`) is no longer part of the public
API, and no core output (event payload or getter) shares live internal
objects. Code that read `getStream(...).segments` should use
`Core.getStreamSegmentRuntimeIds(streamRuntimeId)` instead — it covers the
diffing workflow the segments map was used for (enumeration and membership
checks of segment runtime IDs).

### Tightened read-only types

- `ByteRange.start`/`ByteRange.end` are now `readonly`.
- `SegmentResponse.data` may reference the buffer the core keeps in segment
  storage for P2P upload: treat it as read-only and copy it (`data.slice(0)`)
  before transferring it to a worker.

### `SegmentStorage` interface

The parameter documented as `streamId` is renamed to `streamSwarmId` in all method
signatures, including `setSegmentChangeCallback`. The value passed is
`Stream.streamSwarmId` (format unchanged from the v3 `streamSwarmId`), so custom
storage implementations keep working — only parameter names and documentation
changed.

### Runtime configuration

`swarmId` and `streamSwarmIdBuilder` cannot be changed via `applyDynamicConfig`.
Stream identity is derived from them once at registration; dynamic updates
now strip these properties (previously a plain-JS caller could desynchronize
announced swarms by changing `swarmId` mid-session).
