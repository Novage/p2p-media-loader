# Proposal: read playback state from CMCD

**Status: not adopted.** This is a candidate extension to
[playback-contract.md](../playback-contract.md), recorded so that the decision
to build it can be made on a measured deployment rather than on the appeal of
the idea. Nothing in the system behaves this way today: core learns the
player's buffer only from the reports an integration makes, and the only CMCD
handling that exists is stripping the `CMCD` query argument from registry keys
and the swarm ID (see [manifest-registry.md](../manifest-registry.md)).

## The gap it closes

Core needs one number from the player, for one decision: the buffer ahead of
the playhead, to tell whether a request is urgent
([playback-contract.md](../playback-contract.md), "Urgency"). An integration
reports it with `rate` on every change. A player that never reports is taken
as one with nothing buffered, so every request that the store cannot serve is
urgent and goes over HTTP. Such a player still plays, but it gets from peers
only what prefetch puts in the store before it asks.

That case is the proxy architecture of [mobile-proxy.md](../mobile-proxy.md)
without its shim: a native player that fetches through a local HTTP proxy, with
nothing that reads the player. There, a player that emits CMCD (CTA-5004,
Common Media Client Data) already gives its buffer in the request that core
handles. The `bl` key is the buffer length ahead of the playhead in
milliseconds, `dl` the deadline until it drains, and `pr` the playback rate.
These are the values of the contract, and they come exactly when core needs
them: with the request whose urgency it decides.

So CMCD can meet the reporting requirement for a player that emits it. A later
version may accept it as the required report for integrations that cannot
wrap their player, where today it requires a shim.

In a browser this closes nothing. The media element is free and continuous,
and every bundled adapter already reports from it.

## Design

**Where it is read.** Segment requests reach core through `loadSegment` with
the URL the player built. Before the URL is normalized into a registry key, the
`CMCD` query argument — the only transmission mode that touches the URL — is
parsed as the comma-separated `key=value` list CTA-5004 defines. In a proxy,
the header mode (`CMCD-Request`, `CMCD-Status`, ...) is equally readable, and
the proxy passes those headers to core through the same call. In a browser,
header mode never reaches core and is not needed there.

**What it yields.** A report, applied before the request it came with is
judged:

- `bufferAhead` in seconds, from `dl` divided by `pr` when `pr` is present and
  not zero — the value the player itself derived — and from `bl` otherwise. If
  an implementation sends `pr=0`, the division is degenerate: scaling `dl` back
  would report a full buffer as empty, so `bl` is used whenever `pr` is zero.
- `rate` is `pr` when present, and 1 when absent, as the specification
  directs.

The reading then ages as any report does
([playback-contract.md](../playback-contract.md), "The age of a report"), so a
request that waits becomes urgent as the buffer drains.

**Which stream it describes.** `bl` can be measured per media track rather
than across the presentation: HLS.js reports the requested track's forward
buffer, Media3 the overall buffered duration from the playhead. A per-track
value is the requesting stream's own buffer, which is what its request needs.
So a CMCD reading applies to the stream whose request carried it, and not to
the other streams.

**What it cannot yield.** A pause. CTA-5004 defines `pr=0` as "not playing",
but implementations report the media element's `playbackRate`, which stays at 1
while paused. More fundamentally, CMCD comes with requests, and a pause is the
absence of requests. A paused player's reading ages as if it were playing, so a
request that waits during a pause can become urgent and go over HTTP where P2P
had time. The cost is P2P share, never playback. The shim does not have this
limit, which is why [mobile-proxy.md](../mobile-proxy.md) prefers it.

**Precedence.** A report from the integration and a CMCD reading are the same
kind of value. Core uses the most recent of them for a stream.

**Bounds.** Parsing a short query argument, or a few headers, per request. No
wire change, and no new configuration.

## How to decide

The question is how much P2P a proxied player that reports nothing loses, and
whether CMCD gets it back. Measure in a real proxy deployment, not in a browser,
where the answer is already that nothing is lost:

1. Run the proxy integration without a shim against a host application that
   has CMCD enabled — Media3 with a `CmcdConfiguration.Factory`. AVPlayer does
   not emit CMCD and cannot take part.
2. Run each session twice, for ten minutes or more with a few seeks: once with
   no report, once with the CMCD readings applied.
3. Compare the P2P share, the share of requests that were urgent, and the
   HTTP copies of each segment in the swarm.

**Implement** when the CMCD readings raise the P2P share by a clear margin, or
when an integration that needs P2P cannot add a shim. **Do not implement** if
prefetch alone gives such a player most of its P2P share: the reading would
then add a code path no deployment needs.

Before building, ask whether the integration can wrap the player instead. An
application willing to edit how it builds its media source to enable CMCD is
one step from installing the shim, and the shim is better: continuous, exact,
and aware of pauses. This proposal is for the host that has CMCD on already
and will not add a shim.
