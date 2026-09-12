# Manifest parsing and the registry

## Entry point

Core receives manifest bytes from the adapter:

```ts
core.processManifest({ url: string, data: ArrayBuffer | string }): void
```

The protocol is detected from the payload — an HLS playlist begins with
`#EXTM3U`, an MPD is XML with an `MPD` root element — and may be stated
explicitly when the adapter knows it. Parsing uses
[`m3u8-parser`](https://github.com/videojs/m3u8-parser) for HLS and
[`mpd-parser`](https://github.com/videojs/mpd-parser) for DASH.

Detection selects among the parsers an integration has **already included at
build time**; it never decides what to load. Parsers are supplied statically by
the integration, so a bundler can see exactly which ones are reachable and an
HLS-only build never carries the DASH parser. Core performs no module
resolution at runtime — the IIFE build target could not do so, and the size
saving is realised by the bundler rather than by the network. See
[packaging.md](packaging.md).

A manifest whose protocol has no registered parser is ignored, and its segments
therefore load without P2P. This is the same degradation as an unrecognised
URL: never an error, never wrong bytes.

The call is idempotent: re-processing an unchanged manifest produces no
registry changes and no events. A manifest that fails to parse leaves the
registry exactly as it was — the previous segment list stays in force rather
than being emptied by a transient bad response.

## Master versus media manifests

An HLS master playlist declares variants and renditions and contains no
segments; an HLS media playlist lists segments and declares no variants. The two
are distinguished by content, not by URL. A DASH MPD declares both in one
document.

Core registers **streams** from the master manifest (or the MPD's
`AdaptationSet`/`Representation` tree) and **segments** from each media
playlist. A media playlist fetched directly, with no master above it, is a
single anonymous stream.

## The registry

```
swarm
└── stream (per variant / rendition)
    └── segment (keyed by URL + byte range)
```

Segments are keyed by the URL the player will request, including byte range
where `EXT-X-BYTERANGE` or a DASH `mediaRange` applies. This key is what a
segment request is resolved against. Relative URIs are resolved to absolute
form before being stored — against the media playlist's URL for HLS, and
through the `BaseURL` chain down from the MPD's URL for DASH — because that is
the form the player will request. Keys are normalized as described under
[URL normalization](#url-normalization).

Each registered segment carries:

| Field                  | Meaning                                                                          |
| ---------------------- | -------------------------------------------------------------------------------- |
| `url`, `byteRange`     | The request key                                                                  |
| `externalId`           | Canonical identity, on the wire — see [segment-identity.md](segment-identity.md) |
| `startTime`, `endTime` | Position on the stream's stable manifest timeline                                |

## Where segment lists come from

A stream's segments are described by a **segment index**. Most of the time the
manifest is that index, and the segments are known the moment it is parsed:

- an HLS media playlist lists its segments directly;
- a DASH `SegmentTemplate` or `SegmentTimeline` describes them arithmetically.

`SegmentBase` is the exception. The MPD carries only an `indexRange` pointing at
a `sidx` box **inside the media file**; the segment list does not exist in the
manifest at all. Parsing such an MPD yields a stream with no segments and an
external index reference.

Core models both cases with one shape, so that a stream is registered either
way:

```ts
type SegmentIndexSource =
  | { kind: "manifest" }
  | { kind: "external"; url: string; byteRange: ByteRange };
```

A stream whose index is `external` is registered with its identity, properties
and swarm membership intact, but with **no segments**. Its segment requests miss
the registry and fall through to the player's own loader, so the stream plays
normally without P2P. This is the same degradation as any other registry miss —
never an error, never wrong bytes.

> **This is a regression, not a gap.** Shaka Player resolves `SegmentBase`
> indexes itself, and the previous design read segments back out of Shaka's
> index, so Shaka + DASH `SegmentBase` streams share over P2P today. Deriving
> the registry from the manifest gives that up until an external index can be
> resolved. Resolving it is therefore a prerequisite for moving the Shaka
> adapter over, not an optional enhancement — or an accepted, deliberate loss
> of capability.

### Resolving an external index

Support for `sidx`-indexed streams is added by resolving `external` sources into
segments. Two properties of the design make that an additive change rather than
a restructuring:

**Identity already works.** A `sidx` box describes subsegments by duration, from
which presentation times follow. DASH `externalId` is derived from presentation
time precisely so that a segment identifies the same way whichever index
produced it, so resolving an external index introduces no protocol change and
needs no version bump. See [segment-identity.md](segment-identity.md).

**The bytes arrive on their own.** A player must fetch the index before it can
request any media, and it fetches it through the same loader hook core already
intercepts. Core therefore sees the `sidx` bytes without issuing a request of
its own, consistent with observing manifests rather than polling them
([architecture.md](architecture.md)). The index is a byte range of the media
file itself, typically adjacent to the initialization segment and often fetched
with it, so this is not an additional resource either.

Seeing the bytes is not the same as knowing what they are. An index request
misses the registry by definition — its segments are exactly what is not yet
known — so "pass through on a miss" cannot handle it. The adapter recognises the
request as a stream's pending index and hands the response to core, exactly as
it does for a manifest. That recognition is a distinct request type in some
players (dash.js issues it as `INDEX_SEGMENT_TYPE`, not `MEDIA_SEGMENT_TYPE`),
and an adapter that handles only manifest and media types will watch it go by.

A player may fetch a range wider than the index alone — initialization and
index together — so the `sidx` box is located by walking the MP4 box structure,
never assumed to sit at the start of the response.

Resolving an index therefore requires the `sidx` parser and this recognition
path. Two limits then remain by design of the conversion, which is
`mpd-parser`'s own: **hierarchical indexes** — references that point at further
`sidx` boxes rather than at media — are dropped rather than followed, and 64-bit
offsets or times beyond the safe integer range are rejected. Both are rare in
practice; neither is silently wrong, since an unresolved index degrades to no
P2P.

## URL normalization

Segments are keyed by the URL the player will request, but players do not always
request a stable URL. Client-side telemetry appends a per-request parameter, so
the same segment is fetched under a different URL every time. Keyed naively,
every lookup would miss and P2P would silently never engage.

The parameter in practice is **`CMCD`**, the query-argument transmission mode of
CTA-5004 Common Media Client Data. Every player targeted here supports CMCD and
leaves it disabled by default, but each one defaults to _query_ mode once it is
enabled — so this is a configuration a deployment can switch on without any
indication that P2P stopped working.

| Player             | CMCD | Default mode when enabled |
| ------------------ | ---- | ------------------------- |
| hls.js             | yes  | query (`useHeaders` off)  |
| dash.js            | yes  | query                     |
| Shaka Player       | yes  | query (`useHeaders` off)  |
| ExoPlayer / Media3 | yes  | configurable              |
| AVPlayer           | no   | —                         |

Header mode (`CMCD-Object`, `CMCD-Request`, `CMCD-Session`, `CMCD-Status`)
leaves the URL untouched and needs no handling.

Registry keys are normalized before comparison: parameters on an explicit
telemetry list are removed, and everything else is preserved exactly.
Normalization applies only to the key. The URL used to fetch is always the one
the player supplied, because segment URLs are frequently signed and carry
authorization in the query string.

Normalization must be conservative. Removing an unknown parameter risks
collapsing two genuinely distinct segments onto one key, which would serve the
wrong bytes — the one failure mode this design does not tolerate. Only listed
parameters are stripped.

### Why swarm ID is normalized differently

The swarm ID derived from the manifest response URL discards the **entire**
query string, rather than stripping a list. The two rules look inconsistent and
must not be reconciled:

- **Swarm ID** is a grouping every peer has to agree on. A peer that keeps any
  session-scoped parameter lands in a swarm of one. Discarding the whole query
  is the only way to guarantee agreement, and nothing is fetched from the
  result, so discarding costs nothing.
- **Segment keys** are matched against URLs that will actually be requested. A
  signed URL carries its token in the query, and the token differs per viewer,
  so the key must keep the query apart from listed telemetry parameters.

Making either rule match the other breaks something: widening segment keys to
discard the query would collide distinct segments and break signed fetches;
narrowing swarm ID to a strip list would fragment swarms on the first
unrecognised parameter.

## Live updates

A manifest refresh — an HLS media playlist, or the whole MPD for DASH —
produces a diff against the registry: segments present in the new parse and
absent from the registry are added; segments absent from the new parse are
removed. Both operations are driven by the URL key, so a sliding window needs
no positional reasoning and no assumptions about registration order.

A stream whose playlist stops being refreshed retains its segments until the
stream itself is removed.

## Timeline stability

`startTime` and `endTime` must mean the same thing across playlist refreshes.
This is the one place where a naive HLS implementation silently breaks.

Computing segment start times as a running sum of `EXTINF` durations from the
top of the playlist re-bases every value each time a live window slides
forward — the same segment's `startTime` changes between two refreshes, and any
arithmetic that spans a refresh becomes meaningless.

Core establishes a stable timeline instead:

**HLS, with `EXT-X-PROGRAM-DATE-TIME`.** The tag maps a segment to wall-clock
time and is required only on the first segment of a playlist, but `m3u8-parser`
extrapolates it to every segment from a single occurrence — forward by
accumulating durations from the last tag, and backward for segments preceding
the first tag. The resulting `programDateTime` is an absolute timeline that
survives refreshes, and it is used directly.

**HLS, without `EXT-X-PROGRAM-DATE-TIME`.** Core anchors on media sequence,
per stream. The first parse of a stream records its first media sequence number
against an arbitrary base time (zero); every later parse derives `startTime` by
accumulating durations from that base. Media sequence numbers are monotonic
across refreshes by specification, so the anchor holds for the life of the
stream. `EXT-X-DISCONTINUITY` does not disturb it: the manifest timeline is a
running sum of durations, and a discontinuity only matters to a clock this
timeline is never compared against.

**DASH.** `mpd-parser` yields presentation time, which is already stable across
refreshes. No anchoring is required.

The timeline's zero point is arbitrary and never leaves core: nothing compares
it to the player's clock. See [playback-contract.md](playback-contract.md).

## Live detection

Whether a stream is live is derived from the manifest, not reported by the
adapter.

For HLS the sole reliable signal is `EXT-X-ENDLIST`, which promises no further
segments will be appended. `EXT-X-PLAYLIST-TYPE` is optional and its absence
proves nothing — a sliding-window live playlist and an untagged VOD look
identical without it. Core treats a stream as live when the playlist carries no
`EXT-X-ENDLIST` and is not typed `VOD`.

For DASH, `@type="dynamic"` is authoritative.

A live stream that ends gains `EXT-X-ENDLIST`, and core reclassifies it on the
next refresh. That is correct: it is no longer live.

## Segments core does not register

- **Partial segments and preload hints** (`EXT-X-PART`,
  `EXT-X-PRELOAD-HINT`) — see the scope note in
  [architecture.md](architecture.md). Registering a preload hint would announce
  a URL to peers that does not yet resolve.
- **I-frame playlists** (`EXT-X-I-FRAME-STREAM-INF`) — trick-play only, not
  worth swarm capacity.
- **Initialization segments** (`EXT-X-MAP`, DASH `Initialization`) — recognised
  and deliberately passed through. See below.
- **Segments behind an unresolved external index** (DASH `SegmentBase`) — the
  stream is registered, its segments are not, until the index is resolved. See
  [Where segment lists come from](#where-segment-lists-come-from). Unlike the
  entries above, which are deliberate exclusions, this one is capability the
  previous design had.

### Initialization segments

An initialization segment is recorded against its stream so that core recognises
the URL, and is then **always loaded over HTTP**. It is never announced to peers,
never stored, and never requested from one.

Recognition is what distinguishes this from an unknown URL: the request is
passed through knowingly rather than counted as a registry miss, so the
diagnostics below stay meaningful.

The case for sharing them is superficially strong — every peer on a rendition
needs byte-identical initialization data, so availability in the swarm would be
near total. It is outweighed:

- They are **small**, a few kilobytes of `ftyp` and `moov`, so the transfer
  saved is negligible against the P2P announce and connection overhead.
- They are requested **at startup**, when the viewer is most sensitive to delay
  and a peer round-trip is least affordable.
- They are the **most cacheable** object in a stream, so a CDN or browser cache
  usually answers them without a network request at all.
- `externalId` denotes a position on the timeline. An initialization segment has
  no position, so sharing one would need a parallel identity scheme on the wire
  for a few kilobytes of benefit.

An `EXT-X-MAP` that names a byte range of the same file as its media segments
resolves naturally: its key differs by range, so it is recognised as the
initialization segment rather than colliding with media.

## Divergence between core and the player

Core's parse and the player's may disagree — on malformed manifests, on tags one
supports and the other does not, or on unusual structures. The URL-keyed
registry makes this safe: an unrecognised URL is a lookup miss, the adapter
falls back to its own loader, and the segment loads without P2P.

Core emits a diagnostic event on a segment request that misses the registry, so
divergence is observable in production rather than silent.
