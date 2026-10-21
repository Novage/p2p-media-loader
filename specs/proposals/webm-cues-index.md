# Proposal: read WebM `Cues` indexes

**Status: not adopted.** This is a candidate extension to
[manifest-registry.md](../manifest-registry.md), "Resolving an external index",
recorded so that the decision to build it can be made on traffic rather than
memory. Nothing in the system reads a `Cues` element today.

## The gap it closes

A DASH `SegmentBase` representation lists no segments: its `indexRange` points
at an index inside the media file, and the core reads that index to learn the
segments. The core reads one kind of index, the ISO BMFF `sidx` box. A WebM
representation's `indexRange` points at an EBML `Cues` element instead, so the
index resolves to nothing, the stream is left with no segments, and every
request for it misses the registry and plays through the player's own loader
without P2P.

The Shaka demo asset `angel-one` shows it: its MP4 renditions gain segments when
their index arrives, and its WebM (VP9) renditions never do
([verification.md](../verification.md)).

## Why it is contained

Most of the path is already protocol-neutral:

- A WebM `SegmentBase` stream already registers as awaiting an index. The DASH
  parser decides that from `indexRange`, not from the container.
- The index request is already recognised by `isSegmentIndex`, and every adapter
  already hands its response to `processSegmentIndex` unchanged.
- The reader is already a per-protocol hook, `parseSegmentIndex`, supplied by
  the DASH parser alone, so a second reader stays out of HLS-only bundles
  ([packaging.md](../packaging.md)).
- Identity is presentation time, accumulated from the period start, for every
  DASH addressing mode ([segment-identity.md](../segment-identity.md)). A WebM
  segment would identify the same way an MP4 one does, with no derivation of its
  own on the wire and **no protocol version change**.

## What `Cues` gives, and what it does not

A `sidx` box is self-contained: each reference carries its size and duration,
and positions follow from where the box itself sits in the response. `Cues` is
not. Each `CuePoint` carries a start time and the position of the `Cluster` that
begins there, and nothing else. Three things the layout needs live in the
**initialization range**, not in the index range:

| Needed                          | Where it lives                                                  | Why                                                                 |
| ------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| Where the `Segment` data starts | `Segment` element header, after the EBML header                 | `CueClusterPosition` is relative to it, not to the file             |
| `TimestampScale`                | `Info` element                                                  | `CueTime` is in its units; the default is 1 ms but may be changed   |
| Where the last cluster ends     | `Segment` size, and `Duration` in `Info`, or the MPD's duration | a cue gives only where a cluster starts, so the last one needs both |

Sizes and durations are implied rather than stated: a segment ends one byte
before the next cue's cluster, and lasts until the next cue's time.

Today the core never sees the initialization range's bytes. `isSegmentLoadable`
recognises an init segment and passes it through to the player's own loader, as
it should for every other stream.

## Design

**Await two ranges for a WebM stream.** Where the DASH parser registers a
`SegmentBase` stream whose `mimeType` is `video/webm` or `audio/webm`, it marks
the external index as needing both the initialization range and the index range.
`isSegmentIndex` then answers true for either, so the adapters hand both
responses to `processSegmentIndex` exactly as they already do for the index
alone. **No adapter changes.** The registry holds whichever arrives first and
resolves the stream when it has both. A player that fetches initialization and
index in one request — a response spanning both — resolves it in one step.

**Generalise the hook's result.** `parseSegmentIndex` returns a `SidxBox`, which
is MP4-shaped: box offset, box size, first offset. Rather than have a `Cues`
reader counterfeit one, the hook should return a neutral index: a list of
references with a byte offset relative to the response, a size, and a duration
in seconds. `resolveExternalIndex` then lays either kind out from the period
start by accumulated duration, as it does now for `sidx`. That keeps where a
segment sits on the timeline the core's decision, in one place, for both
containers.

**Read only what is needed.** A reader walks EBML elements by ID and size and
descends into five of them. The IDs are fixed by the Matroska specification,
which the implementation should be checked against:

| Element              | ID           | Used for                                  |
| -------------------- | ------------ | ----------------------------------------- |
| `Segment`            | `0x18538067` | data start and size                       |
| `Info`               | `0x1549A966` | contains the two below                    |
| `TimestampScale`     | `0x2AD7B1`   | units of `CueTime`                        |
| `Duration`           | `0x4489`     | closing the last segment                  |
| `Cues`               | `0x1C53BB6B` | the index                                 |
| `CuePoint`           | `0xBB`       | one per segment                           |
| `CueTime`            | `0xB3`       | segment start                             |
| `CueTrackPositions`  | `0xB7`       | contains the position below               |
| `CueClusterPosition` | `0xF1`       | cluster start, relative to `Segment` data |

A DASH representation carries one track, so the reader takes the first
`CueTrackPositions` of each point. An element of unknown size, or a position
beyond the safe integer range, fails the whole index, the same rule the `sidx`
reader applies: an index that cannot be read leaves its stream without P2P,
never with wrong segments.

## Risks

**Byte ranges must agree with the players', to the byte.** The registry matches
a request by URL and range, so the ranges derived here have to be exactly the
ones dash.js and Shaka request from their own `Cues` parse. Both read the same
element, so they should agree, but a disagreement fails silently, as a registry
miss rather than as wrong bytes. The last cluster is where it is most likely:
whether a player ends it at the `Segment` end, at the file end, or leaves it
open.

**Where `Cues` sits.** Tools that write DASH WebM usually place `Cues` before the
clusters so the index is fetched early, but the element may follow them. The
reader must not assume either, and the last cluster's end must come from the
`Segment` size rather than from where `Cues` starts.

**Players that lay the ranges out themselves.** VHS derives `SegmentBase` ranges
through `mpd-parser`, which is already wrong for MP4 files
([verification.md](../verification.md)), and has no WebM `SegmentBase` path of
its own worth relying on. Video.js is out of scope for this; dash.js and Shaka
are the players to verify against.

## How to verify

1. Unit tests on real bytes: the initialization and index ranges of one
   `angel-one` WebM rendition, captured once, laid out and compared against the
   ranges dash.js and Shaka request for it.
2. Golden vectors for the resulting identities, added beside the MP4 ones, since
   identity is the wire format.
3. In the browser, `angel-one` on dash.js and on Shaka with
   `localStorage.debug = "p2pml-core:*"`: `p2pml-core:registry-miss` lines for
   the WebM renditions go from one per segment to none, and two tabs exchange
   those renditions over P2P.
4. The `angel-one` row in [verification.md](../verification.md) then says the
   WebM renditions gain segments too, and the limit in
   [manifest-registry.md](../manifest-registry.md) naming WebM goes.

## Whether to build it

The mechanism is contained: one reader, one change to what the hook returns, one
change to what a stream awaits, and none to the adapters. The case for it is
traffic. WebM in DASH is uncommon now that VP9 and AV1 are shipped in fragmented
MP4, and a deployment serving WebM `SegmentBase` renditions is the thing that
would justify the work. Until one does, those renditions keep playing, only
without P2P.
