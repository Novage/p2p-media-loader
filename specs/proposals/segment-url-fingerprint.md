# Proposal: a URL fingerprint on each segment request

**Status: not adopted.** This is a candidate extension to
[segment-identity.md](../segment-identity.md) and to the peer protocol,
recorded so that its default can be chosen on measured URLs rather than on
guesses. Nothing in the system compares URLs between peers today.

## The gap it closes

The URL-keyed registry makes a peer's own parse error degrade to "no P2P"
([architecture.md](../architecture.md), "Data flow"). It does not protect
against two peers that hold **different content under one identity**. Peers
know a segment only by its stream swarm ID and its `externalId`, and a peer
sends whatever bytes it stored under that pair. Viewers get different content
under one identity in these cases, each described in
[segment-identity.md](../segment-identity.md):

- one master URL that gives viewers different streams — an A/B test of the
  ladder, renditions filtered by device or region — under one `swarmId`;
- a master that lists its variants in another order for each viewer, with no
  `streamIdBuilder`;
- a `swarmId` string for a player that plays several videos;
- a `streamIdBuilder` that gives two streams one ID;
- personalised ads under the content's identity, and ad breaks of different
  lengths, which shift the content's sequence numbers or presentation times
  per viewer.

In each case a peer can be given another rendition's, another video's or
another viewer's bytes. The core finds this only by chance: a size check fails
only where the expected size is already known, from a byte range or from an
HTTP response. A whole-file segment of the wrong content passes, unless the
integrator set `validateP2PSegment`, and the integrator has no expected hash
to compare with. The player then fails to decode, plays the wrong picture, or
stalls.

Each case is an integration error or a personalised stream, so the docs tell
integrators what to configure. But an integrator who does not know the rule
gets wrong bytes, not "no P2P", which breaks the principle that a mistake
degrades to "no P2P".

## Design

**A fingerprint on the request.** `SegmentRequest` gets one more field, `f`: a
32-bit hash of the requester's fingerprint of the segment's URL. A peer that
gets the request computes the fingerprint of the URL it holds the segment
under, from its own registry. Where the two differ, it sends `SegmentAbsent`,
as for a segment it does not have, and counts it
(`SegmentFingerprint:mismatch`). The requester then goes on as after any
`SegmentAbsent`: another peer, or HTTP. A request with no `f` is served as
today.

**The fingerprint.** The URL's parts that identify the content and are the
same for every viewer. Which parts those are is the open question:

| Option                                                                           | Detects                                                                          | Loses P2P where                                                       |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| A. The whole path                                                                | Every collision whose content differs in its path                                | Any per-viewer part in the path: a path token, a session ID, a prefix |
| B. The last two path parts (`720p/seg_12.ts`), and a function                    | Renditions swapped by index, another video, ad files, in usual layouts           | A per-viewer part in the last two path parts                          |
| C. A function only (`segmentFingerprint: (url) => string`), off by default       | Only what an integrator configures                                               | Nowhere, by default                                                   |
| D. No URL: the media time in the segment (`tfdt`, TS PTS) against the manifest's | Content shifted in time — ad breaks of different lengths — with no configuration | Nowhere; but weak on HLS without PDT, and blind to same-length ads    |

The host and the query are never part of the fingerprint: they differ between
viewers by design (a CDN edge, a token, CMCD).

Per-viewer parts in the path are common enough to rule out A as a default:
tokens of nginx `secure_link` (`/s/<hash>/<expires>/…`), Wowza and Akamai path
tokens, session IDs that SSAI services put in the path, per-tenant prefixes.
They usually sit in the leading parts, which B does not read.

**The integrator's override**, for B and C: `segmentFingerprint`, a static
stream option like `streamIdBuilder`. It gets the segment URL and returns the
string to hash, or a constant to turn the check off. It must return the same
string on every peer for the same segment.

**The likely choice is B.** It needs no configuration for the common
collisions, it ignores the usual places of per-viewer parts, and a deployment
whose stable part is elsewhere gives a function. D can be a second layer for
SSAI with breaks of different lengths, but it does not close the gap alone.

## Cost

- **Wire.** Four bytes and a field code on each `SegmentRequest`; nothing on
  announcements, which carry most of the protocol's traffic.
- **Protocol version.** The binary command reader throws on what it cannot
  parse, so a 5.x peer that does not know `f` may reject a request that
  carries it. If it does, the field needs a new `PEER_PROTOCOL_VERSION`,
  which splits 5.x swarms by version. That is cheapest before 5.0.0 is
  released; check the reader's handling of an unknown field first.
- **Code.** The fingerprint function, one field, one comparison in the upload
  path, a counter, the option, and tests: about a hundred lines.
- **A false refusal costs P2P, not playback.** A segment refused for a
  fingerprint mismatch loads from another peer or over HTTP.

## Limits

- A fingerprint finds a collision only where the two URLs differ in the parts
  it reads. Two contents with the same file names in the same directory names
  under one identity are not found by B.
- It does not stop a peer that lies on purpose: a peer can send any
  fingerprint. HTTP stays the source of truth, as today.

## How to decide

1. **Measure first, refuse later.** Ship the field in observe mode: the peer
   that serves a request compares the fingerprints for options A and B, counts
   `SegmentFingerprint:match` and `SegmentFingerprint:mismatch` for each, and
   serves the bytes in either case.
2. Collect the counters from the demo, the release tests, the mobile test
   tool, and from integrators willing to run the alpha with them on, on
   streams whose viewers all get the same content.
3. Count the mismatches per option. On such streams every mismatch is a false
   refusal the option would make.

**Adopt B as the default** when its mismatch rate on streams with the same
content for every viewer is close to zero. **Adopt A** if that holds for the
whole path too. **Adopt C** — the function only, off by default — when B's
mismatches are frequent, and document the risk to integrators who do not
configure it. Decide before 5.0.0, while the protocol can still change without
splitting released swarms.
