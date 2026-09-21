# Manifest parsing and the registry

## Entry point

Core receives manifest bytes from the adapter:

```ts
core.processManifest({
  url: string; // the response URL, after redirects
  data: string | ArrayBuffer | ArrayBufferView; // as the player's network layer delivered it
  protocol?: "hls" | "dash"; // when the adapter already knows
}): ProcessedManifest | undefined;
```

The return value is what the manifest described: for each stream it listed
segments for, the stream key, type, whether it is live, the bounds of the
listed segments on the stream's manifest timeline, and their count. A master
playlist yields no entries. An adapter that must size its player's live window
before the player parses the same manifest reads it from here, from the same
parse that fed the registry, rather than parsing again. `undefined` means the
manifest was ignored or failed to parse.

Destroying a core empties it whatever any part of the teardown makes of
itself. An integrator's own segment storage is destroyed there and is free to
throw; a teardown that stopped at it would leave destroyed loaders still
referenced and the failed storage still set, and the next stream to use that
core would take both back and run with P2P silently dead. The first failure is
raised once there is nothing left to reset.

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

The first manifest processed also names the swarm: unless a `swarmId` is
configured or the integration has set the manifest response URL explicitly,
the swarm ID is that manifest's URL with its query string discarded
([segment-identity.md](segment-identity.md)). Every viewer of a stream fetches
the same master first, so this needs no coordination.

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

A master's streams are its variants, its audio renditions with a URI, and its
alternate video renditions with a URI — camera angles, which Shaka plays. A
video rendition takes the attributes of the first variant that references its
group: RFC 8216 requires every rendition of the group to match each such
variant's resolution, so a master that reuses one group across tiers is
malformed and the first reading is taken. A rendition whose URI is a variant's
own is that variant, and one without a URI names nothing — its media is the
variant's playlist. See [segment-identity.md](segment-identity.md) for what
identifies one.

Only video and audio are streams. A master also names playlists that carry
neither — subtitle renditions and I-frame playlists — and those URLs are
recorded, so that a media playlist arriving at one registers nothing rather
than an anonymous stream; it is matched with the same tolerance for a rotated
query string or a redirect as a variant's playlist is. Every master's names
are kept: a player that chose a subtitle track keeps refreshing its playlist
under the name the master it read gave it, whatever a re-fetched master calls
it now, and the list grows under rotated paths exactly as the streams do
(below). The renditions of a group no variant references, audio or video, are
on the list too: nothing plays them, and declared they would carry an identity
made of a name alone. One rule covers the whole list: a URI a declared stream
already has is that stream's, however else the master labels it, so a
malformed master never puts one URL on both sides. A URL the master gives to
both a variant and a subtitle rendition,
query aside, matches a declared stream only by its exact URL: a playlist
arriving there under any other query string could as well be the rendition's,
and attaching it would put WebVTT segments under the variant's identity, so it
is ignored — the variant loads without P2P under a rotated token, for the one
master that tells the two apart by query string alone. An MPD's text and image
`AdaptationSet`s are left out where the MPD is read, and nothing of theirs
arrives later. No adapter has to know a track's kind: every manifest a player
fetches may be handed over. See
[Segments core does not register](#segments-core-does-not-register).

A media playlist is matched to the stream its master declared by URL,
tolerating a query string that differs (signed tokens rotate) and a redirect
(the master named what was asked for, not where the response came from — which
is why an adapter reports both). A match with the query stripped counts only
where one declared stream matches: a master that tells its variants apart by
query string alone leaves every one of them matching, and attaching the
playlist to whichever came first would register one rendition's segments under
another's identity, so the playlist is an anonymous stream instead — and an
anonymous stream already registered at the same stripped URL is that stream on
its next load, whatever token it carries. A playlist that
matches nothing is known by what was asked for, so a CDN answering every
request from somewhere else leaves one stream behind rather than one per
refresh.

A stream's identity and type are decided by the first manifest that registers
it, and never change afterwards: that identity is its swarm, and a live
packager republishing its master with another `BANDWIDTH` would otherwise move
a playing stream into a swarm with no peers in it. A media playlist processed
before its master is not a supported order. No player produces it — the master
is the first manifest a player fetches, and every adapter is in the loading
path from the start — so it can only come from an integrator calling
`processManifest` out of order, and it is handled the simple way: the playlist
registers an anonymous stream, the master arriving later attaches its
declaration to that stream but does not identify it, and the stream shares
only while it is alone of its type (below). Supporting the order would mean
changing a stream's identity, type and swarm under loaders, requests and
stored segments that hold it, for a case nothing reaches.

A master that declares, under another query string, the URL a registered
stream already has declares that stream — a master re-fetched with its playlist
tokens rotated. Only a sole such stream, and only where the master declares one
stream at that URL: a master telling its variants apart by query alone cannot
say which of them a stream was. Such a master re-fetched with rotated tokens
therefore registers its variants again beside the old ones, which keep a stale
segment set; the registry grows by one stream per variant per master refresh.
That is accepted: telling a token apart from a variant parameter would need a
list of token names, and players re-fetch an HLS master rarely or never.

**An anonymous stream is shared only where it is the only stream of its type in
its swarm.** It carries the identity every unidentified stream of its type
carries — the hash of nothing — which is exactly right for a media playlist
that is the whole stream, since every viewer of that URL plays the same bytes.
It is wrong the moment another stream of that type is registered beside it,
which means a rendition whose media playlist could not be matched to the master
that named it; a CDN signing its playlist URLs per response is enough to cause
that. Peers would then exchange segments of different renditions by number, so
such a stream loads without P2P and the reason is logged.

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
manifest at all. Parsing such an MPD yields a stream that says nothing about
segments — not an empty list of them — and an external index reference.

The distinction matters on the second parse. A manifest that lists segments is
the whole truth about that stream, so what it leaves out is removed; a
manifest that lists none of them says only that it never does, and what the
index gave stays. Reading the two alike would take a `SegmentBase` stream's
segments away on the first refresh of a live presentation, and on any
re-parse of a static one, leaving a stream that plays perfectly and shares
nothing. Such a stream is still reported on every parse — how live it is, and
what it holds so far — so an adapter learns of a presentation it has to place
before the index has been read.

Core models both cases with one shape, so that a stream is registered either
way:

```ts
type SegmentIndexSource =
  | { kind: "manifest" }
  | {
      kind: "external";
      url: string;
      byteRange: ByteRange;
      periodStart: number;
    };
```

A stream whose index is `external` is registered with its identity, properties
and swarm membership intact, and gains its segments when the index arrives.
Until it does, the stream's segment requests miss the registry and fall through
to the player's own loader — the same degradation as any other miss: never an
error, never wrong bytes.

### Resolving an external index

A player must fetch the index before it can request any media, and it fetches
it through the loader hook the adapter already intercepts, so core sees the
bytes without issuing a request of its own — consistent with observing
manifests rather than polling them ([architecture.md](architecture.md)). The
index is a byte range of the media file itself, typically adjacent to the
initialization segment and often fetched with it, so it is not an additional
resource either.

Seeing the bytes is not the same as knowing what they are. An index request
misses the registry by definition — its segments are exactly what is not yet
known — so "pass through on a miss" cannot handle it. The adapter recognises the
request as a stream's pending index and hands the response to core, exactly as
it does for a manifest:

```ts
core.isSegmentIndex(url, byteRange); // true for a request covering a registered stream's index range
core.processSegmentIndex({
  url: string; // the media file the index was read from
  byteRange?: ByteRange; // the range that was fetched
  data: ArrayBuffer | ArrayBufferView;
}): ProcessedManifest | undefined; // the streams that gained segments
```

Recognition goes through core, which knows every registered stream's index
location: a request whose range covers it is the index. Like an initialization
segment, it is passed through knowingly and never counted as a registry miss.
In some players recognition is also a distinct request type (dash.js issues it
as `INDEX_SEGMENT_TYPE`, not `MEDIA_SEGMENT_TYPE`), and an adapter that handles
only manifest and media types will watch it go by.

Core locates the `sidx` box by walking the MP4 box structure — a player may
fetch a range wider than the index alone, initialization and index together, so
the box is never assumed to sit at the start of the response — reads its
references, and lays the subsegments out as ISO BMFF defines it: the first
subsegment starts `first_offset` bytes after the end of the `sidx` box itself,
and each further subsegment follows the previous. The anchor is the box, not
the manifest's `indexRange`: an index range may hold more than the `sidx` (a
`uuid` box after it is common, with `first_offset` set to skip it), and
anchoring on the range's end would place every segment that many bytes too far.
Players follow the box, so the registry's byte ranges match the requests they
make. (`mpd-parser` anchors on the range end and is wrong for such files; the
registry does not mirror it here.) Presentation time accumulates from the
period start in the box's timescale. Identity is presentation time, so a
segment identifies the same way whichever index produced it; see
[segment-identity.md](segment-identity.md).

Three limits are by design. **Hierarchical indexes** — references that point
at further `sidx` boxes rather than at media — are not followed. **64-bit
offsets or times** beyond the safe integer range are rejected. And the index
must be an ISO BMFF `sidx` box: a **WebM** representation's `indexRange` points
at an EBML `Cues` element, which is not read, so such streams keep playing
through the player's own loader. None of the three is silently wrong: an index
that cannot be resolved leaves its stream without P2P, as above.

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
| HLS.js             | yes  | query (`useHeaders` off)  |
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

A live window also rolls past the segment the player last requested, whenever
the player has been loading without core for a while — requests that missed the
registry went to its own loader, or it stopped fetching with a full buffer. That
segment is what the request queue is anchored on, so losing it must not stop the
queue: core resumes from the oldest segment the window still holds that is not
behind the anchor. A peer that holds the window is worth something to the swarm
even while its own player is not asking for anything. Where the player actually
is stays unknown until it requests again, so the resume point is the earliest
position it can possibly have, never the live edge.

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
stream. A stream whose earlier parses carried programme dates has those
recorded by sequence too, so a packager that drops the tag mid-session — a
failover to another origin — continues from the wall-clock times already laid
out rather than starting again at zero beside them. A refresh with no segments
records nothing and forgets nothing. `EXT-X-DISCONTINUITY` does not disturb it: the manifest timeline is a
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
- **Subtitles and captions** (`EXT-X-MEDIA:TYPE=SUBTITLES`; DASH text
  `AdaptationSet`s, whether WebVTT, TTML or IMSC in MP4) and **image
  thumbnails** (`image/jpeg` `AdaptationSet`s) — not video or audio. Closed
  captions ride inside the variants and name nothing to register.
- **I-frame playlists** (`EXT-X-I-FRAME-STREAM-INF`, and any media playlist
  declaring `EXT-X-I-FRAMES-ONLY`) and **DASH trick-mode Representations**
  (the DASH-IF `http://dashif.org/guidelines/trickmode` descriptor, on the
  `AdaptationSet` or the `Representation`) — trick-play only, not worth swarm
  capacity. Only the descriptor is recognised; a set signalled by
  `maxPlayoutRate` alone is a video stream like any other, so every peer reads
  it the same way whichever packager wrote it.
- **Initialization segments** (`EXT-X-MAP`, DASH `Initialization`) — recognised
  and deliberately passed through. See below.
- **Segments behind an external index that has not arrived** (DASH
  `SegmentBase`) — the stream is registered when the MPD is parsed; its segments
  are added when the player fetches the index, which it does before requesting
  any media. See
  [Where segment lists come from](#where-segment-lists-come-from).

### Initialization segments

An initialization segment is recorded against its stream so that core recognises
the URL, and is then **always loaded over HTTP**. It is never announced to peers,
never stored, and never requested from one.

Recognition is what distinguishes this from an unknown URL: the request is
passed through knowingly rather than counted as a registry miss, so the
diagnostics below stay meaningful. A stream has as many of them as its manifest
lists — a playlist that spans an HLS discontinuity or a DASH period boundary
carries one per section — and recognition covers every one of them. It covers
only what the manifest lists now, though: an initialization segment that has
rolled out of the window is forgotten with the parse that replaced it, and a
request for it counts as a miss like any other URL the manifests no longer
name. Remembering them all instead would grow for the life of a live session.

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

Core emits a diagnostic event on a segment request that misses the registry and
logs the key it looked up under `p2pml-core:registry-miss`, so divergence is
observable in production rather than silent. Nothing else marks a miss: the
segment loads through the player's own loader and plays normally, so a stream
that has stopped sharing entirely looks exactly like one with no peers.

One disagreement is expected and harmless: segment **boundaries**. A player
corrects its fragment times to the presentation timestamps it finds after
demuxing, so its timeline drifts from the manifest's by the encoder's timing
slack — tens of milliseconds on real streams. The manifest timeline is not
corrected, because nothing in the core compares it to the player's clock
([playback-contract.md](playback-contract.md)), and scheduling windows are
seconds wide. A boundary delta of that size is not a parse error.
