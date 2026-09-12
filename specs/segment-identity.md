# Identity

Identity is what two peers must agree on before they can exchange anything. It
is the only part of the design where being _consistent_ matters more than being
_correct_ — a derivation that is odd but identical everywhere works; a
derivation that is sensible but player-specific does not.

## Stream identity

A stream's swarm membership is derived from normalized manifest properties —
bitrate, codecs, resolution, language, channels, name, frame rate, video range —
hashed into an `identityHash`. Streams with equal normalized properties are the
same stream to every peer, regardless of the player in use or the stream's
position in the manifest.

```
streamSwarmId = `${PEER_PROTOCOL_VERSION}-${swarmId}-${type}-${identityHash}`
infoHash      = derived from streamSwarmId, announced to trackers
```

`swarmId` is the configured value or, if unset, the manifest response URL with
its **entire query string discarded** — a session-scoped parameter such as CMCD
would otherwise place each viewer in a swarm of one. This is stricter than the
normalization applied to segment registry keys, deliberately so; see
[manifest-registry.md](manifest-registry.md#why-swarm-id-is-normalized-differently).
A `streamSwarmIdBuilder` may override the composition.

Because core parses the manifest itself, the properties feeding `identityHash`
are read from the manifest rather than from a player's representation of it.
Every peer hashes the same input.

## Segment identity

`externalId` identifies a segment within its stream. It travels on the wire as
the `i` field of the peer protocol commands, so its derivation is part of the
protocol.

| Protocol | `externalId`                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| HLS      | Media sequence number: the playlist's `EXT-X-MEDIA-SEQUENCE` plus the segment's index within that playlist |
| DASH     | Presentation time in milliseconds, rounded: `Math.round(presentationTime * 1000)`                          |

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

Millisecond resolution is finer than any real segmentation, and presentation
time is computed from integer `timescale` arithmetic in the manifest, so every
peer parsing the same manifest arrives at the same value. Rounding absorbs the
last bit of floating-point representation.

Presentation time is measured on the presentation timeline, not relative to a
period, so a multi-period presentation does not restart identities at each
period boundary.

## Version discipline

`PEER_PROTOCOL_VERSION` is part of every stream swarm ID, so peers with
incompatible derivations never meet in the same swarm.

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

## Runtime identifiers

Distinct from the above, and never on the wire:

- `Stream.runtimeId` — identifies a stream within one process. May differ
  between peers.
- `Segment.runtimeId` — the URL plus byte range; the registry key used to
  resolve an incoming segment request.

Runtime identifiers exist so that local lookups do not have to reason about
swarm identity. They may change freely without protocol implications.
