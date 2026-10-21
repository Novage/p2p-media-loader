# Identity

Identity is what two peers must agree on before they can exchange anything. It
is the only part of the design where being _consistent_ matters more than being
_correct_ — a derivation that is odd but identical everywhere works; a
derivation that is sensible but player-specific does not.

## Stream identity

A stream's swarm is named by the content's `swarmId` and the stream's own
`streamId`, which tells it from the content's other streams:

```
streamSwarmId = `${PEER_PROTOCOL_VERSION}-${swarmId}-${streamId}`
infoHash      = derived from streamSwarmId, announced to trackers
```

Every peer derives both from the manifest, so every peer playing the same
stream names the same swarm, whatever its player. A server can derive them from
the same manifest, before any peer joins — to allowlist the infohashes on a
private tracker, or to ask a tracker for the statistics of each quality. The
core exports the helpers for that (`p2p-media-loader-core/server`).

`swarmId` is the configured value or, if unset, the URL of the first manifest
with its **entire query string discarded** — the URL that was asked for where
an adapter reports one, since every viewer asks for the same URL and a CDN may
answer each of them from a different one — a session-scoped parameter such as CMCD
would otherwise place each viewer in a swarm of one. This is stricter than the
normalization applied to segment registry keys, deliberately so; see
[manifest-registry.md](manifest-registry.md#why-swarm-id-is-normalized-differently).

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

**One master URL, query aside, must give every viewer the same streams.** The
default `swarmId` discards the query, and a stream ID names a stream only among
the streams of its own master, so two masters with different streams under one
`swarmId` put different renditions in one swarm. An origin that gives different
streams under one URL — an A/B test of the ladder, a query parameter that
selects the streams, renditions filtered by device or region — needs a
different `swarmId` for each set of streams: the content's identifier with the
group, the query value or the device class added. Viewers of different sets
then share no swarm, and each index names one rendition.

The `swarmId` and the stream IDs are read once, when a stream is registered,
and never re-read.

### HLS: the stream's place in the master

**An HLS stream's `streamId` is its type and its index among the master's
streams of that type: `main0`, `main1`, …, `secondary0`, …** The index counts
the streams the core registers, in the order of the master:

- `main`: first the variants (`EXT-X-STREAM-INF`), in the order they appear;
  then the alternate video renditions (`EXT-X-MEDIA TYPE=VIDEO` with a URI),
  group by group, in the order the variants first reference the groups, and
  within a group in the order of the master. A player plays a variant or a rendition, never
  both, so they are streams of one type.
- `secondary`: the audio renditions with a URI (`EXT-X-MEDIA TYPE=AUDIO`) of
  the groups a variant references, group by group in the same order.
- **A playlist URI counts once, at its first appearance.** A master may list
  one video playlist under several `EXT-X-STREAM-INF`, one per audio group; it
  is one stream, with one index.
- I-frame playlists, subtitle renditions, renditions without a URI and groups
  no variant references are not streams, and count for no type.

**A media playlist with no master is `main`**, with no index. It cannot know
its place among streams it has not seen, and an index would make it the
master's first variant: an anonymous stream would then share a swarm with one
declared stream of another viewer, whose rendition it may not be. See
[manifest-registry.md](manifest-registry.md) for when an anonymous stream is
shared.

**Audio only.** The type follows the master's structure, not the media's
content: a variant is `main` whatever it carries, and an `EXT-X-MEDIA` audio
rendition is `secondary`. An audio-only stream therefore takes one of three
forms:

- **Variants only** — each `EXT-X-STREAM-INF` an audio playlist, with an
  audio `CODECS` and no `RESOLUTION`: the variants are `main0`, `main1`, … in
  the order of the master, and there is no `secondary` stream. A player plays
  the chosen variant as its main stream.
- **Variants with an audio group** — the variants reference an `AUDIO` group
  whose renditions have URIs: the variants are `main` and the renditions
  `secondary`, counted as above. A rendition whose URI is a variant's own is
  that variant, and is counted once, as `main`; the group's other renditions
  are `secondary`.
- **A single audio media playlist**, with no master: `main`, as any media
  playlist without one.

The same audio playlist can therefore be `main0` in one master, `secondary0`
in another, and `main` played alone. That is right: the two masters are two contents with
two `swarmId`s, and a stream ID only tells a stream from the other streams of
its own master.

**The index is the master's order as the core parses it, not a player's.** A
player's own list of qualities is no stable basis: HLS.js, for one, sorts its
levels by bitrate. The core reads the master text itself, so every peer, and a
server reading the same master, counts the same way.

**No attribute enters the default `streamId`.** An origin may rewrite a
master's attributes from one request to the next. Akamai's live packager
publishes the encoder's current output as `BANDWIDTH`, and a channel that
alternates programmes publishes the current programme's `FRAME-RATE` — 24 for
one programme and 25 for the other — although RFC 8216 defines both over the
whole variant stream. A player reads the master once, when it starts, so a
stream identity hashed from such attributes splits a swarm by when each viewer
started. The position of a variant in the master does not change with them; a
master with one variant is `main0` whatever it states.

**When the index is the wrong default,** a `streamIdBuilder` (below) gives the
streams IDs of the integration's own:

- **A master that shuffles its variants** on every request: the same rendition
  has another index for each viewer. A builder returns an ID made of the
  properties that tell the streams apart — codecs, resolution, name,
  language, channels, as in the `streamIdBuilder` example of the API
  documentation — or whatever the integration's own catalogue calls the
  quality. Height alone gives every audio rendition one ID, and every rung
  at one height.
- **A master that differs per viewer** — filtered by device or region, a
  variant left out for some viewers, an A/B test: the indexes shift between
  viewers, and one index names different renditions for them. Their peers
  then exchange segments of the wrong rendition, which the player cannot
  decode: the default fails with wrong bytes here, not with "no P2P". A
  different `swarmId` for each set of streams fixes it (above); a builder is
  the other way.
- **Redundant variants**, one rendition listed twice for failover between two
  CDNs, and **content steering**, one rendition listed for each pathway: they
  get two indexes and two swarms. A failover is rare, but a steering server
  divides the viewers between pathways all the time, so with two equal
  pathways each rendition has two half-size swarms (KNOWN-ISSUES.md). A
  builder can give the copies one ID (below).
- **A variant added or removed during a live stream:** a viewer who starts
  afterwards counts differently from one who started before. One viewer is
  hit too where its core processes the master again: a variant inserted
  before the others takes the index, and so the stream ID and the segment
  store, of the variant that had it, and the player gets the old variant's
  stored segments for the new one. HLS.js and Shaka read an HLS master once,
  so only an integration that calls `processManifest` with a re-fetched master
  gets there.

### DASH: the Representation's `@id`

**A DASH stream's `streamId` is its type and its Representation's `@id`:
`main-<@id>` for video, `secondary-<@id>` for audio.** Text, image and
trick-mode AdaptationSets are not streams.

- **`@id` is mandatory and unique within a Period** (ISO/IEC 23009-1), so two
  Representations that play at the same time never share an ID.
- **No attribute enters it.** `@bandwidth`, `@frameRate` and the codecs string
  may change from one Period to the next, or from one refresh of a live MPD
  to the next; the `@id` does not change with them.
- **The order of the Representations does not matter**, so an MPD that lists
  them in another order on each request gives the same IDs.
- **It is what the parser joins Periods on.** `mpd-parser` merges a
  Representation's segments across Periods by its `@id`, and the core's stream
  is that merged Representation, so one core stream is one swarm.

**Across Periods.** A Period is a span of the presentation timeline: content,
an ad break, content again. What its Representations are called decides the
streams:

- **The same `@id`s in several Periods** — content before and after an ad
  break, or an ad that reuses the content's `@id`s: one stream and one swarm
  throughout. Its segments are told apart by their presentation time, which
  runs on across Periods (see "Segment identity"), so the content's segments
  and the ad's never share an `externalId`.
- **Other `@id`s** — an ad break with Representations of its own: other
  streams and other swarms. A player that moves into the ad moves to those
  streams, as it would in a quality switch, and back to the content's streams
  after it.

The type stays in the ID although an `@id` is unique among all the
AdaptationSets of a Period: it gives DASH the form HLS has, and it keeps video
and audio apart in a tracker's statistics where a packager reuses an `@id` for
another type in another Period. A server reads the `@id`s from its own MPD.

**When `@id` is the wrong default,** a `streamIdBuilder` gives the streams IDs
of the integration's own:

- **`@id`s generated anew for every Period**, such as `p123_video_720`: each
  Period is a new swarm, and P2P starts again at every Period change. A
  builder can map them to stable IDs, by height for example.
- **`@id`s that differ per viewer**, in an MPD made for each session.
- **Ads that differ per viewer under the content's `@id`s:** viewers who get
  different ads hold different bytes at one presentation time in one swarm. A
  builder must keep the ads' Representations apart, or the integration must
  give each session its own `swarmId`.

An MPD whose Representations have no `@id` is invalid, and `mpd-parser` merges
them into one playlist; it is not supported.

### A custom stream ID

A `streamIdBuilder` returns the `streamId` of each stream the core registers;
the core composes the swarm ID around it, so a custom ID always carries
`PEER_PROTOCOL_VERSION` and the content's `swarmId`. It receives what a peer
knows of the stream when it registers it:

- `swarmId`, and the stream's type;
- its key: the media playlist URL for HLS, the Representation `@id` for DASH. A
  URL can differ from viewer to viewer — a CDN host, a signed path or query —
  so a builder uses only a part every viewer has alike, such as an unsigned
  file name, which can tell apart two rungs that differ only in a bitrate the
  origin rewrites;
- its properties, as the core reads them from the manifest (below);
- the default `streamId`: `main0` for HLS, `main-<@id>` for DASH, `main` for
  a media playlist with no master;
- for an HLS stream, its index within its type, as defined above;
- the manifest's URL and its streams, each with its key, type, default
  `streamId` and properties.

Returning `undefined` keeps the default. A builder must return the same ID on
every peer for the same stream — it must not read anything a peer has of its
own, such as a playlist URL with a CDN host or a signed path — and a server
predicting the infohash applies the same function to the same manifest. **It
must return a different ID for each different stream of the content.** The
core does not check it: two streams with one ID are one swarm, and their peers
exchange segments of the wrong stream. One rendition listed twice — in two
masters under one configured `swarmId`, or for each CDN in one master — may
take one ID, and then shares one swarm and one segment store: viewers on the
two copies exchange segments, and a segment one copy fetched serves a request
for the other. A viewer that fails over from one copy to the other holds both
copies' P2P loaders, which announce one infohash, for
`p2pInactiveLoaderDestroyTimeoutMs`; that overlap is not tested (see
KNOWN-ISSUES.md). Like
`swarmId`, the builder is read once per stream and cannot be changed at
runtime.

A builder that returns something other than a non-empty string or
`undefined`, or throws, fails the stream's registration: the stream is
reported through `onStreamRegistrationError` and plays without P2P.

**The properties a builder receives** are read from the manifest, not from a
player's model of it, and are passed as the manifest wrote them: a codecs
string, a frame rate, a language tag are not normalized. Where a player's own
model gives other answers:

- **HLS: a variant's `codecs` are its video codecs**; the audio codecs belong
  to the audio rendition. An audio-only variant, with no video codec, has its
  audio codecs.
- **HLS: an alternate video rendition** (`EXT-X-MEDIA TYPE=VIDEO` with a URI)
  has the attributes of the variant that references its group — bitrate,
  codecs, resolution, frame rate, video range — plus its own `NAME` and
  `LANGUAGE`. RFC 8216 makes the variant's characteristics the rendition's.
- **DASH: `bitrate` is the Representation's own `@bandwidth`.** For a video
  stream that is the video bit rate alone; a player that pairs video and
  audio into variants reports their sum.
- **DASH: an audio stream's `name` is its Representation `@id`**, the one
  stable, manifest-given name it has; a `label` is optional, and a parser may
  synthesise one. `channels` is read from `AudioChannelConfiguration` under
  the MPEG scheme (`urn:mpeg:dash:23003:3:audio_channel_configuration:2011`),
  whose value is a plain count; vendor schemes encode channel masks and are
  left unset rather than guessed.

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

This follows from core parsing the manifest itself. Taken from each player's
own model, the derivation would be a different one per player and protocol —
one of them reconstructing media sequence numbers from player internals — and
every cross-player swarm would rest on that reconstruction being exactly right.

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
a `SegmentTimeline`, or a `sidx` box. That is what lets an externally indexed
stream share a swarm with a templated one, with no derivation of its own on the
wire.

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

### Where a numbered template's segment sits on that timeline

A `SegmentTemplate@duration` with no `SegmentTimeline` numbers its segments
(`$Number$`) and gives no media time. Segment `k` of a period sits at
`periodStart + (k − startNumber) × duration / timescale`. The template's
`@presentationTimeOffset` says where the media's own timestamps begin, which
the player needs to place the bytes; it does not move the segment on the
presentation timeline.

`mpd-parser` computes a template segment's time as `periodStart + (time −
presentationTimeOffset) / timescale`. That is right for a `SegmentTimeline`,
whose `S@t` is a media time and holds the offset. For a duration template it
counts `time` from the period start, as `index × duration`, and so takes off
an offset it never added: every segment lands `presentationTimeOffset` early.
A presentation whose media timeline runs on across periods — `livesim2`'s
`periods_60`, a packager's ad breaks — sets each period's offset to that
period's own start, and its times then begin at 0 in every period. Its
periods carry the same Representations, so they share one stream swarm, and
two periods' segments shared one `externalId`: the storage served the
previous period's segment for the next one's request, and dash.js appended
it 60 s back, leaving the new period's place empty.

The parser therefore hands `mpd-parser` each duration template with no
offset (`withNumberedTemplateTimes` in `manifest/dash.ts`), and `mpd-parser`
places its segments from the period start. Nothing else it computes from the
offset changes; which segments a live window holds does not depend on it. A
`SegmentTimeline`, a `SegmentList` and a `SegmentBase` keep the times they
had. A duration template whose offset is 0 — a single-period stream as most
packagers write it — keeps the same `externalId`s.

The same times are the segments' start times in the core, so the storage's
position and the prefetch windows run on the presentation timeline too, and
the previous period's segments fall behind the position as any other.

`mpd-parser` lists a live period up to the present, past the start of the
next one, so a segment near a period change comes under both periods, with
one URL. With the offset taken out, both entries carry the same time and the
same `externalId`, and the registry, which finds a segment by URL, holds one.

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

**The derivations above are themselves a protocol version.** A peer deriving
identity any other way — a per-player sequence number, a truncated half-second
DASH bucket — is in a swarm of its own by construction, since the version sits
in every stream swarm ID. That is the intended outcome and not a defect: two
derivations that disagree must not be allowed to meet.

**Any change to how a `streamId` or an `externalId` is derived requires
bumping it.** This includes changes that look cosmetic: a different normalization of a
codec string, a different rounding of a frame rate, a different base for a
segment number. Peers cannot negotiate identity — they can only agree or fail to
find each other.

**A pre-release is the exception.** A derivation that changes between
pre-releases of one major version, before any stable release carried it, keeps
the version: no deployment depends on a pre-release, so nothing is lost when a
pre-release peer and a release peer do not meet. The 5.0.0 pre-releases hashed
the stream's properties under `v3`; 5.0.0 names streams by their place in the
manifest under the same `v3`.

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
