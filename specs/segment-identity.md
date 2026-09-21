# Identity

Identity is what two peers must agree on before they can exchange anything. It
is the only part of the design where being _consistent_ matters more than being
_correct_ — a derivation that is odd but identical everywhere works; a
derivation that is sensible but player-specific does not.

## Stream identity

A stream's swarm membership is derived from its manifest properties — codecs,
resolution, frame rate, video range, language, channels, name, and where needed
bitrate — hashed into an `identityHash`. Streams with equal properties are the
same stream to every peer, regardless of the player in use or the stream's
position in the manifest.

```
streamSwarmId = `${PEER_PROTOCOL_VERSION}-${swarmId}-${type}-${identityHash}`
infoHash      = derived from streamSwarmId, announced to trackers
```

`swarmId` is the configured value or, if unset, the URL of the first manifest
with its **entire query string discarded** — the URL that was asked for where
an adapter reports one, since every viewer asks for the same URL and a CDN may
answer each of them from a different one — a session-scoped parameter such as CMCD
would otherwise place each viewer in a swarm of one. This is stricter than the
normalization applied to segment registry keys, deliberately so; see
[manifest-registry.md](manifest-registry.md#why-swarm-id-is-normalized-differently).
A `streamSwarmIdBuilder` may override the composition.

**A configured `swarmId` is the integration's own identifier for the content** —
the key it already has for it, a database row id, an asset id — not another
URL. It only has to be stable and unique in that system: every viewer of that
content must resolve to the same value, and no other content may use it. That
is what makes it worth configuring, since an identifier from the system that
publishes the stream survives what a URL does not — a CDN migration, a
per-viewer edge host, a signed path, a re-published manifest.

It names a set of streams, not a rendition. Every viewer under one `swarmId`
must be playing the same content, so an integration that configures one has to
hand the core the manifest that declares the whole set — the master or the MPD.
Two viewers given one `swarmId` and a different media playlist each, with no
master between them, register a stream the manifest identified nothing about
(see [manifest-registry.md](manifest-registry.md)); alone in its core each such
stream is shareable, and the two would then be one swarm exchanging segments of
different renditions by number.

The value is read once, when a stream is registered, and never re-read.

Because core parses the manifest itself, the properties feeding `identityHash`
are read from the manifest rather than from a player's representation of it.
Every peer hashes the same input, so nothing is normalized: a codec string, a
frame rate, a language tag is hashed as the manifest wrote it. The
normalization the previous protocol carried existed to reconcile what
different players reported for one rendition; with one parser there is nothing
to reconcile.

**Bitrate is part of a stream's identity only where the manifest needs it.**
Bandwidth is the one attribute an origin may recompute on every request: some
live packagers (Akamai's, for one) publish the encoder's current output as
`BANDWIDTH`, so two viewers who fetched the master seconds apart read different
values for the same rendition and, were it hashed, would never meet. Core
therefore hashes each stream without its bitrate unless another stream of the
same type in the same manifest would then be indistinguishable — a ladder with
two rungs at one resolution and codec — in which case those streams, and only
those, keep it. The decision is a function of the manifest alone, so every peer
makes the same one; `identityProperties` implements it and is exported for a
server reproducing the hash. A ladder whose rungs share a resolution _and_ whose
origin recomputes bandwidth is the one case left unsolved, and it is the one
where no manifest attribute short of the rendition URL tells the rungs apart.

**A missing attribute says nothing about the others.** A variant that declares
no `BANDWIDTH` is malformed — the attribute is required — but its resolution
and codec string are still read the same way by every peer, so they still tell
it from the other variants and they are still hashed. Only bandwidth is
special, and only because an origin may recompute it. A stream whose manifest
gives it nothing to be identified by hashes the empty identity, which every
such stream shares; [manifest-registry.md](manifest-registry.md) says when one
of those may be shared.

Two of those inputs need stating for DASH, because a player's own model gives
different answers:

- **`bitrate` is the Representation's own `@bandwidth`.** For a video stream
  that is the video bit rate alone. A player that pairs video and audio into
  variants reports their sum, which makes a video stream's identity depend on
  which audio track the viewer chose — two viewers of the same video with
  different audio would not share it. The manifest value is independent of that
  choice. (HLS `BANDWIDTH` already covers the whole variant by specification, so
  the two protocols differ here on purpose; they never share a swarm.)
- **An audio rendition's `name` is its Representation `@id`**, the one stable,
  manifest-given name it has. A `label` is optional, and a parser may synthesise
  one from language and role. `channels` is read from
  `AudioChannelConfiguration` under the MPEG scheme
  (`urn:mpeg:dash:23003:3:audio_channel_configuration:2011`), whose value is a
  plain count; vendor schemes encode channel masks and are left unset rather than
  guessed.

One needs stating for HLS. **An alternate video rendition** (`EXT-X-MEDIA
TYPE=VIDEO` with a URI) is identified by the attributes of the variant that
references its group — bitrate, codecs, resolution, frame rate, video range,
exactly as the variant is — plus the rendition's own `NAME` and `LANGUAGE`.
RFC 8216 makes the variant's characteristics the rendition's, and `NAME` is
what tells the two apart, so neither ever forces `bitrate` into the other. The
variant carries no name or language of its own, so its identity is the same
whether or not a group refers to it.

## Segment identity

`externalId` identifies a segment within its stream. It travels on the wire as
the `i` field of the peer protocol commands, so its derivation is part of the
protocol.

| Protocol | `externalId`                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| HLS      | Media sequence number: the playlist's `EXT-X-MEDIA-SEQUENCE` plus the segment's index within that playlist |
| DASH     | Presentation time in 100 ms units, rounded: `Math.round(presentationTime * 10)`                            |

Neither depends on when a peer joined, what its player buffered, or how far into
the stream it started — two peers watching the same live stream from different
points derive the same `externalId` for the same segment.

This is the single most important consequence of core parsing manifests itself.
The previous design derived `externalId` three different ways depending on the
player and protocol, one of which reconstructed media sequence numbers from
player internals. Cross-player swarms depended on that reconstruction being
exactly right.

### Why DASH uses presentation time rather than a segment number

A segment number looks like the natural analogue of HLS media sequence, but it
is not available in a form that survives every DASH addressing mode:

- `mpd-parser` reports a **zero-based index into the current parse**, not the
  `$Number$` value. It is `0` for the first segment regardless of `startNumber`,
  so on a live sliding window the same index denotes different media at
  different times. Using it directly would make two peers who joined minutes
  apart assign one `externalId` to two different segments.
- `SegmentBase` representations have no segment numbers at all. Their index
  lives in a `sidx` box, which describes subsegments by **duration**, so
  positions on the timeline are the only identity such a segment can have.

Presentation time is the one property every DASH addressing mode agrees on, so a
segment identifies the same way whether its index came from a `SegmentTemplate`,
a `SegmentTimeline`, or a `sidx` box. That is what allows indexed-segment support
to be added without a protocol change.

Presentation time is computed from integer `timescale` arithmetic in the
manifest, so every peer parsing the same manifest arrives at the same value,
and rounding absorbs the last bit of floating-point representation.

The unit is a trade between two pressures. It must be finer than any real
segment, or two segments would share one identity — 100 ms is well under the
shortest segments outside the low-latency profiles this design excludes. And
it should be as coarse as that allows, because `externalId` is the bulk of the
peer protocol's traffic: every stored-segment announcement lists them, packed by
an encoding that groups ids sharing their high bytes and spends one byte per id
within a group. Live presentation times run from 1970, so in milliseconds a
current id needs seven bytes and consecutive two-second segments are 2000
apart — every id its own group, and an announcement of thirty segments costs
some 240 bytes to every peer on every change. In 100 ms units the same id fits
six bytes, consecutive segments are 20 apart, a dozen share a group, and the
announcement is a few dozen bytes. Finer units buy nothing and cost every peer
upstream bandwidth on every announcement.

Presentation time is measured on the presentation timeline, not relative to a
period, so a multi-period presentation does not restart identities at each
period boundary.

### Where a `SegmentBase` subsegment sits on that timeline

A `SegmentBase` representation lists no segments: its subsegments come from the
`sidx` box the player fetches, and the registry lays them out **from the start
of the period, by accumulated subsegment duration**. The box's
`earliest_presentation_time` and the MPD's `@presentationTimeOffset` are read
past, not applied. `mpd-parser` lays the same subsegments out the same way,
which is what Video.js plays them from; Shaka and dash.js apply both values.
That divergence is harmless, because an `externalId` is exchanged between peers
and never shown to a player.

Applying the earliest presentation time on its own would be wrong rather than
merely different: a DASH presentation time is the period start plus the media
time less `@presentationTimeOffset`, and a multi-period presentation with a
continuous media timeline sets that offset precisely to cancel the media clock.
Honouring one without the other would count the period's offset twice for
exactly those streams.

What this costs is a uniform shift, by the earliest presentation time, of every
subsegment of a stream whose MPD declares no offset. It is the same shift for
every peer, and nothing compares times between streams, so identity and the
request queue stay consistent. **Changing it shifts every `SegmentBase`
`externalId` and requires a protocol version bump**, by the rule below.

## Version discipline

`PEER_PROTOCOL_VERSION` is part of every stream swarm ID, so peers with
incompatible derivations never meet in the same swarm.

**This design is itself a protocol version.** Both derivations above differ from
the previous version's — HLS moved from a per-player sequence number or index to
the manifest's media sequence, DASH from a truncated half-second bucket to
rounded 100 ms presentation time — so the manifest-driven core carries its own
`PEER_PROTOCOL_VERSION`, and peers running the previous version form separate
swarms from it. That is the intended outcome, not a defect: the two derive
identity differently and must not be allowed to meet.

**Any change to how `identityHash` or `externalId` is derived requires bumping
it.** This includes changes that look cosmetic: a different normalization of a
codec string, a different rounding of a frame rate, a different base for a
segment number. Peers cannot negotiate identity — they can only agree or fail to
find each other.

Identity derivation is frozen by golden vectors in the core test suite. Those
vectors are not expectations to be updated when the code changes; they are the
wire format. A change that breaks them is a protocol change, and the correct
response is to bump the version and add a new set, keeping the old ones as a
record of what the previous version produced.

Because DASH identity is computed by the manifest parser — presentation time is
`mpd-parser`'s output — **the parser is part of the wire format.** A parser
upgrade that computes presentation time differently is a protocol change even
though no line in this repository changed. The golden vectors therefore include
real manifests with the `externalId` each segment must receive, not only
property-to-hash fixtures, so that a dependency update is caught the same way a
code change is.

## Runtime identifiers

Distinct from the above, and never on the wire:

- `Stream.runtimeId` — identifies a stream within one process. May differ
  between peers.
- `Segment.runtimeId` — the URL plus byte range; the registry key used to
  resolve an incoming segment request.

Runtime identifiers exist so that local lookups do not have to reason about
swarm identity. They may change freely without protocol implications.
