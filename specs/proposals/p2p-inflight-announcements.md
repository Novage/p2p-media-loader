# Proposal: announce P2P downloads in flight

**Status: not adopted.** This is a candidate extension to
[prefetch.md](../prefetch.md), recorded so that the decision to build it can be
made on measurements rather than memory. Nothing in the system behaves this way
today.

## The gap it closes

A peer announces the segments it holds and the segments it is fetching over
HTTP. It does not announce the segments it is pulling over P2P. So when a
segment travels through a relay chain — the owner fetches, a neighbour takes it
over P2P, a further peer takes it from that neighbour — the further peer sees
silence until the relaying neighbour holds the segment. Its backup deadline
counts down against that silence, and if the chain is slower than the deadline
it fetches over HTTP a segment that was about to arrive.

That is the only duplicate fetch the election and backups leave in a stable
swarm. It cannot occur where every peer is the owner's neighbour; it occurs in
sparse swarms, on slow links, and grows with the length of relay chains.

## Design

**Wire.** The segments announcement gains a third list, `d`, of segment ids
this peer is currently downloading over P2P. It is bounded by
`simultaneousP2PDownloads`. The field is additive: the deserializer builds a
generic record and validates only required fields, so a peer that does not
know `d` ignores it and a peer that does not receive it reads an empty list.
No protocol version change.

**Sender.** A P2P download starting, finishing, or being aborted changes the
announced state and so triggers a broadcast, alongside today's triggers (a
segment landing in or leaving storage, an HTTP fetch starting). Broadcasts are
coalesced: changes within a short interval — 50 to 100 ms — are merged into one
full-state announcement. This keeps the message count where it is today rather
than doubling it, and it is safe because announcements are full state: a merged
announcement is never wrong, only slightly later.

**Receiver.** Each peer keeps, per connected peer, the set of segments that peer
has announced in flight, replaced wholesale on every announcement and dropped
when the peer disconnects. An in-flight entry is a hint, never a lock.

**Backups.** A backup that sees a segment announced in flight by a neighbour
extends its patience for that segment: it waits as if it were the last in line,
stepping in only when the time left falls to one fetch time plus the
announcement allowance, instead of the multiple its rank would otherwise give
it. If the in-flight announcement is withdrawn — the neighbour aborted or
disconnected — the backup's ordinary deadline applies again at once. A stuck
source can therefore cost a backup some patience, bounded by its own deadline,
but never a stall.

**Bounds.** Bytes: a handful per announcement. Messages: unchanged with
coalescing. CPU: encoding a few integers, invisible beside media transfer.

## How to decide

The loader logs every HTTP prefetch it makes as `prefetch … as owner` or
`prefetch … as backup #n` under `p2pml-core:hybrid-loader-*`. The question is
how many backup fetches were premature: the segment would have arrived over
P2P before the player needed it.

Measure on real multi-peer sessions, not two peers on one machine, where every
peer is the owner's neighbour and the gap cannot show:

1. Run a swarm of at least a dozen peers on ordinary consumer links, playing a
   live stream for ten minutes or more, with the loader namespace enabled.
2. Count HTTP prefetches by kind. The share of `backup` fetches is the upper
   bound on what this proposal can save.
3. Of the backup fetches, count the premature ones: a backup fetch is premature
   if a neighbour announced the same segment as held within one estimated fetch
   time after the backup started. A debug-only diagnostic in the loader can
   report this directly; until then it can be read off the announcement timing
   in the logs.

**Implement** when premature backup fetches exceed a few percent of all HTTP
prefetches in such a swarm. **Do not implement** if backup fetches are rare or
mostly not premature — in that case the duplicates are owner failures, which
this proposal does not address, and the remedy is the deadline rule's factors.

Before building, try the cheaper lever: raising the backups' rank factors in
`shouldFetchNow` makes backups wait longer on slow chains at no wire cost, at
the price of stepping in later when the owner has genuinely failed. If a larger
factor removes most premature fetches without raising player stalls, the
proposal is not needed.
