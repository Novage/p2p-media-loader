# Proposal: read playback state from CMCD

**Status: not adopted.** This is a candidate extension to
[playback-contract.md](../playback-contract.md), recorded so that the decision
to build it can be made on a measured deployment rather than on the appeal of
the idea. Nothing in the system behaves this way today: core has two playback
sources, `reported` and `inferred`, and the only CMCD handling that exists is
stripping the `CMCD` query argument from registry keys and the swarm ID (see
[manifest-registry.md](../manifest-registry.md)).

## The gap it closes

Core learns where the player is in one of two ways. An adapter that can read
the player reports `bufferAhead` and `rate` on every media event; that is exact,
continuous, and knows about pauses. Where nothing can read the player, core
infers the buffer from the request pattern, which is approximate and blind to a
seek that issues no request.

The second case is the proxy architecture of
[mobile-proxy.md](../mobile-proxy.md): a native player fetching through a local
HTTP proxy, with no shim wrapping it. There, a player that emits CMCD
(CTA-5004, Common Media Client Data) is already describing its own buffer in
the very request core is handling — the `bl` key is the buffer length ahead of
the playhead in milliseconds, `dl` the deadline until it drains, `pr` the
playback rate. Reading them would replace an estimate with the player's own
number, once per request, at no cost to the integration.

In a browser this closes nothing. The media element is free and continuous, and
both bundled adapters already report from it; the spec's rule is that a
directly readable player always wins. The proposal matters only where a player
cannot be read and the host application has already turned CMCD on.

## Design

**Where it is read.** Segment requests reach core through `loadSegment` with
the URL the player built. Before the URL is normalized into a registry key, the
`CMCD` query argument — the only transmission mode that touches the URL — is
parsed as the comma-separated `key=value` list CTA-5004 defines. In a proxy,
the header mode (`CMCD-Request`, `CMCD-Status`, ...) is equally readable and
the proxy would pass those headers to core through the same call; in a browser
header mode never reaches core and is not needed there.

**What it yields.** `bufferAhead` in seconds, from `dl` divided out by `pr`
when `pr` is present and non-zero — the quantity the player itself derived —
and from `bl` otherwise. Should an implementation ever send `pr=0`, the
division is degenerate: scaling `dl` back would report a full buffer as empty,
so `bl` is authoritative whenever `pr` is zero. `rate` is `pr` when present and
1 when absent, as the specification directs.

**What it cannot yield.** A pause. CTA-5004 defines `pr=0` as "not playing",
but implementations report the media element's `playbackRate`, which stays at 1
while paused — and more fundamentally CMCD is request-triggered, and a pause is
the absence of requests. A paused player looks like a playing one, with the same
consequence as under inference: the estimate decays and core prefetches a
window beyond the edge once. The shim does not have this limit, which is why
[mobile-proxy.md](../mobile-proxy.md) prefers it.

**Where it ranks.** A third source, `cmcd`, between `reported` and `inferred`:

| Source     | Accuracy                          | Available when                      |
| ---------- | --------------------------------- | ----------------------------------- |
| `reported` | exact                             | the integration can read the player |
| `cmcd`     | exact, `bufferAhead` only         | the player emits CMCD               |
| `inferred` | approximate, blind to quiet seeks | always                              |

A fresh `reported` state always wins. A CMCD reading is a sample taken when the
request was issued, so it arrives once per segment duration in steady state and
is stale between times; the same staleness window applies to it as to a
reported state, and past the window core falls to inference as it does today.

**Never blended.** `bl` may be measured per media track rather than across the
presentation — HLS.js reports the requested track's forward buffer, Media3 the
overall buffered duration from the playhead — and neither is interchangeable
with a media element's intersected buffered ranges. A CMCD reading therefore
stands on its own: it is never averaged with, or used to correct, another
source, and the buffer-full and seek anchors of inference are not fed from it.

**Bounds.** Parsing a short query argument per request; no wire change, no new
configuration. The tracker gains one source and one line in its priority order.

## How to decide

The question is whether inference is wrong enough, in a real proxy deployment
whose player emits CMCD, to be worth a third source. Measure there, not in a
browser, where the answer is already no:

1. Run the proxy integration without a shim against a host application that
   has CMCD enabled — Media3 with a `CmcdConfiguration.Factory`; AVPlayer does
   not emit CMCD and cannot take part.
2. Log, at every segment request, the `bl` the request carried beside the
   `bufferAhead` inference produced at that moment (`p2pml:playback-oracle` prints
   the inferred value and its source).
3. Compute the inference error per request, in seconds, over a session of ten
   minutes or more including a few seeks.

**Implement** when the inference error exceeds one segment duration on more
than a small share of requests, or when the sessions show player stalls or a
lower P2P share that the logs tie to a wrong estimate. **Do not implement** if
inference tracks `bl` within a segment: the third source would then add a code
path no deployment needs.

Before building, ask whether the integration can wrap the player instead. An
application willing to edit how it builds its media source to enable CMCD is
one step from installing the shim, and the shim is strictly better: continuous,
exact, and aware of pauses. This proposal is for the host that has CMCD on
already and will not add a shim; if that host does not exist, neither should
the source.
