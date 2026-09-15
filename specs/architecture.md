# Architecture

## Principle

**Core owns the manifest. Adapters own the plumbing.**

Core parses the HLS playlist or DASH MPD itself and derives everything it needs
from that parse: which streams exist, which segments they contain, what each
segment's identity is, and where each segment sits on the stream's timeline. A
player adapter never describes the stream to core.

This inverts the earlier design, in which every adapter translated its player's
internal model into core's `Stream` and `Segment` types. That translation was
the source of the system's hardest problems: each player exposes a different
model, so each adapter derived segment identity differently, and peers running
different players could not reliably recognise the same segment.

## Division of responsibility

### Core

- Parses manifests and maintains the stream and segment registry
  ([manifest-registry.md](manifest-registry.md)).
- Derives canonical stream and segment identity
  ([segment-identity.md](segment-identity.md)).
- Decides, per segment, between P2P and HTTP, and when
  ([playback-contract.md](playback-contract.md)).
- Runs the peer protocol, the segment store, and the HTTP loader.

### Adapter

An adapter does exactly three things ([player-adapters.md](player-adapters.md)):

1. **Feeds manifest bytes to core** — from the responses the player already
   fetches, not from separate requests. Where a stream's segment index lives
   outside the manifest, the index bytes are fed the same way.
2. **Serves segment requests through core** — the player's loader hook asks
   core for the bytes, falling back to its own loader when core does not
   recognise the URL. Every other request type — licences, keys, timing,
   steering — passes through untouched ([encryption.md](encryption.md)).
3. **Reports playback state** — buffer ahead of the playhead, and rate.

Nothing else. An adapter does not enumerate streams, compute segment IDs,
translate timelines, or tell core which variant is active.

## Why core parses instead of asking the player

**Identity must be identical across players.** `externalId` is on the wire. Two
peers only exchange a segment if they agree on its identity, so a browser peer
on hls.js, a browser peer on Shaka, and a mobile peer behind the proxy must all
derive it the same way. One parser, running everywhere, guarantees that by
construction. Per-player derivation cannot.

**Player internals are not a stable interface.** Reconstructing HLS media
sequence numbers from Shaka required hooking `segmentIndex` and maintaining a
parallel `mediaSequenceTimeMap` — private behaviour that breaks on upgrade.

**New players become cheap.** Adding a player means implementing the three
responsibilities above, not modelling its manifest representation.

## Data flow

```
                    ┌─────────────────────────────────────────┐
   player ──────────┤ 1. manifest bytes                       │
   fetches          │      → parse → stream/segment registry  │
   playlist         │                                          │
                    │ 2. segment request (URL + byte range)    │
   player ──────────┤      → registry lookup                   │
   requests         │      → known?   P2P / HTTP decision      │
   segment          │      → unknown? tell adapter to fall back │
                    │                                          │
   player ──────────┤ 3. playback state (bufferAhead, rate)    │
   plays            │      → urgency                           │
                    └─────────────────────────────────────────┘
                                      core
```

Two properties of this flow matter.

**The registry is keyed by URL.** A segment request is resolved by looking up
the URL the player asked for, never by position or index. If core's parse
disagrees with the player's about what a URL means, the lookup misses, the
adapter falls back to its default loader, and playback is unaffected. The
failure mode of a parse disagreement is _no P2P_, never _wrong bytes_.

**Core owns the bytes it seeds.** What is stored is what peers are served, so
nothing a player can reach may alias it: the segment handed to an adapter is a
copy, made in the one place bytes leave core. Players transfer the buffer they
are given to a transmuxing worker — hls.js and video.js's VHS both do — and a
transfer detaches the buffer it came from, leaving `byteLength` 0. Were that
the stored buffer, the peer would go on announcing the segment and uploading
nothing, while its own player was served nothing on any later request: a stream
that plays perfectly and shares emptiness. Copying at the boundary rather than
in each adapter means no integration can get it wrong, and a prefetched segment
the player never asks for is never copied at all.

**The active variant is implied, not declared.** Core learns which rendition is
playing from the last requested segment. A player must fetch a media playlist
before it can know that playlist's segment URLs, so core has always parsed a
variant before the first segment request from it arrives — including
immediately after an ABR switch.

## Nothing empty enters the swarm

A segment of no bytes is not a segment, and it is contagious: stored, it is
announced and uploaded, and every peer that takes it stores and announces it in
turn, while each of their players is handed nothing and stalls or drops the
rendition. Core therefore refuses a zero-length segment at every boundary it
can be met at.

- **From a server.** An HTTP response that carries no bytes fails the attempt;
  the retry rules then apply as they do to any failure.
- **From a peer.** A `SegmentData` command announcing zero bytes is a protocol
  error and the connection is dropped. A peer with nothing to send says so with
  `SegmentAbsent`. Zero is meaningful only as the remainder of a resumed
  transfer, where the bytes are already held.
- **To a peer.** A stored segment that reads back empty is never uploaded;
  `SegmentAbsent` is sent instead.
- **To the player.** A stored segment that reads back empty is not a hit: the
  segment is loaded again, at once.

The last two can only happen where a storage implementation does not own its
bytes, so both are logged rather than passed over quietly — a peer that seeds
nothing is otherwise indistinguishable from a peer with no peers.

## Why manifests are observed, not polled

Core parses the manifest responses the player already makes, rather than
fetching the manifest on its own timer.

- **No divergence.** An independent poll gives core a different live window than
  the player has, so core registers segments the player has dropped and misses
  ones it just received.
- **Credentials already apply.** Manifest URLs are frequently signed and
  short-lived. A separate fetch loop would need to reproduce the player's
  authentication and would double token consumption.
- **The active variant follows for free**, as described above.
- **No duplicated CDN traffic** and no additional rate-limit exposure.

Independent polling is available as an opt-in for live streams, where seeing a
segment slightly before the player does gives P2P more time to fetch it. It is
never the default.

## What is explicitly out of scope

**Low-latency streaming.** At the live edge there is nothing to share — no peer
has the data meaningfully before anyone else — so the low-latency extensions of
both protocols are outside P2P:

- **LL-HLS** partial segments (`EXT-X-PART`) and preload hints
  (`EXT-X-PRELOAD-HINT`). Core parses these tags only in order to ignore them:
  they are never registered, so they are never announced to peers.
- **LL-DASH** chunked segments, which a player fetches while they are still
  being produced (`availabilityTimeComplete="false"`). These requests are left
  to the player's own streaming loader; core serves whole segments only.

This is a permanent exclusion. It is different in kind from a stream whose
segment index lives outside the manifest (DASH `SegmentBase`): such streams are
shared like any other once their index has arrived, which the player fetches
before it can request any media. See
[manifest-registry.md](manifest-registry.md).
