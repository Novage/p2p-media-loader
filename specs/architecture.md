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
   fetches, not from separate requests.
2. **Serves segment requests through core** — the player's loader hook asks
   core for the bytes, falling back to its own loader when core does not
   recognise the URL.
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

**The active variant is implied, not declared.** Core learns which rendition is
playing from the last requested segment. A player must fetch a media playlist
before it can know that playlist's segment URLs, so core has always parsed a
variant before the first segment request from it arrives — including
immediately after an ABR switch.

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

**Low-latency HLS.** Partial segments (`EXT-X-PART`) and preload hints exist at
the live edge, where there is nothing to share — no peer has the data
meaningfully before anyone else. Core parses these tags only in order to ignore
them: partial segments and preload hints are never registered, so they are never
announced to peers.

This is a permanent exclusion, distinct from a capability that is merely absent.
DASH `SegmentBase` streams also carry no P2P today, but because their segment
index has not yet been implemented rather than because sharing them is
pointless; the design reserves a place for it. See
[manifest-registry.md](manifest-registry.md).
