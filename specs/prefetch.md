# Prefetching and the HTTP election

A segment reaches a swarm over HTTP once and over P2P from then on, if the
peers can agree on who fetches it. This is how they agree.

## What is prefetched

Every peer fetches the segments its player demands (the high-demand window in
[playback-contract.md](playback-contract.md)) over HTTP or, when a peer already
has them, over P2P. Beyond that window, in the HTTP and P2P windows, core
prefetches ahead of the player: it loads segments over P2P from any peer that
announces them, and it loads over HTTP the segments that no peer has yet, so
that there is something for the swarm to share. The second kind of load is the
one that needs coordination — every peer fetching the same new segment over
HTTP is the failure this section prevents.

How far ahead that reaches is the HTTP window's business, not the election's.
A live window holds less than the window config asks for, so the candidate set
is whatever the playlist carries. A long VOD truncates nothing: the default
window reaches 3000 seconds ahead, an owner fetches what it owns across all of
it as soon as it is elected, and what stops the peer is the storage brake —
prefetching halts below ten percent free, and a VOD retains everything ahead of
the playhead ([playback-contract.md](playback-contract.md)). A peer therefore
fills its share of the next fifty minutes and then holds. Whoever would rather
not spend those bytes on a viewer who may leave lowers `httpDownloadTimeWindow`;
the election needs no horizon of its own.

## The election

For each segment, every peer scores itself and each peer it is connected to
with the same hash of peer id and segment `externalId`. The peer with the
lowest score in its own neighbourhood is the segment's **owner**. The owner
fetches the segment over HTTP as soon as it sees it, and announces the fetch
to its peers as it starts (the announcement carries segments in flight as
well as segments held). Everyone else waits for that announcement and takes
the segment over P2P once it is held.

The decision is local: a peer needs only its own connections, never the whole
swarm. Yet it gives, in any topology:

- **No two connected peers both fetch.** One of them has the smaller score.
- **The segment always enters the swarm, and reaches everyone over P2P.** In
  a connected component the global minimum is always an owner. A peer that is
  not an owner has a neighbour with a lower score; that neighbour is either
  the owner or is itself waiting on a neighbour with a lower score still, so
  the segment travels back along the chain of decreasing scores, one P2P hop
  per relay, and no one fetches it over HTTP twice.
- **HTTP load per segment is about `n / (d + 1)`** for `n` peers with `d`
  connections each — the rate at which local minima of a random score occur.
- **Ownership rotates.** The segment id is in the score, so a peer owns its
  share of segments over time and no peer is the swarm's permanent origin.

The election is evaluated on every queue pass, and a queue pass runs on every
playlist refresh, so the owner begins fetching when the segment appears rather
than on a timer.

## Backups

A non-owner does not wait forever, and it does not wait by the clock. The
scores that elected the owner also rank everyone else: the second-lowest score
is the first backup, the third-lowest the second, and so on.

Each backup judges its own deadline. Core knows when a segment will enter the
player's high-demand window ([playback-contract.md](playback-contract.md)) and
what an HTTP fetch of it should take — its size, estimated from segments of the
same stream already loaded or else from the stream's bitrate, over the
throughput HTTP transfers have recently achieved. A backup steps in when the
time left until the high-demand window falls to a multiple of that fetch time,
plus a small allowance for the owner's announcement to arrive. The multiple
shrinks with rank: the first backup at twice the fetch time, the second at one
and a half, towards once. Backups therefore act in order, each only when the
one before it has not, and none of them fetches while there is still time for
the owner or a relaying neighbour to deliver. That order is as local as the
scores behind it; how local is below.

A deadline passes with no queue event behind it — a paused player reports
nothing, a proxy never does — so the election is re-checked on a timer as
well, every one to two seconds whatever the swarm's size. The deadlines it
judges are sub-second multiples of a fetch time; a period that grew with the
peer count would let a segment enter the high-demand window unfetched. Every
tick elects: the election reads the playhead estimate, the connected peers,
the bandwidth samples behind the fetch-time estimate and the HTTP slots in
use, and any of them can move with no pass to show for it. A queue is a walk
over the stream's segment map, and a reporting player drives that walk once a
second through its reports anyway.

This is what happens when the owner is slow, has not yet seen the segment in
its own playlist, or has left, and when a relay chain is too long for the
segment to arrive in time. It is also the only path in the design that is
paced by the link rather than by a constant: a fast link waits longer, a slow
one steps in sooner.

## What remains uncoordinated

Two peers' views of the swarm differ while a connection is opening or closing.
In that moment both may compute themselves the owner and both fetch. It is the
same duplicate an uncoordinated scheme produces all the time, confined to
churn.

Rank is counted among a peer's connections, so the order it imposes is only as
wide as they are. Dense connectivity represents every rank from zero upwards
among a peer's neighbours and the deadlines stagger as described. Sparse
connectivity collapses them: along a chain of peers connected only to their
neighbours in it, each has exactly one neighbour scoring lower, so every peer
but the owner is the first backup and all of them carry the same deadline. If
it arrives they fetch together rather than in turn, one duplicate per link in
the chain. Density is what makes the staggering work, and `p2pMaxPeers` at its
default of 50 gives a peer a spread of ranks in any swarm large enough to need
one.

A relay chain is invisible while it moves: a peer pulling a segment over P2P
announces it only once it holds it, so a peer further down the chain sees
silence and, if the chain is slower than its deadline, fetches over HTTP a
segment that was about to arrive. Announcing P2P downloads in flight would
close this; it is recorded as a proposal, with the measurement that would
justify it, in
[proposals/p2p-inflight-announcements.md](proposals/p2p-inflight-announcements.md).

A peer far behind the live edge and one at the edge hold different segments in
their windows; each elects owners only among the segments it wants. Nothing
here makes the two exchange segments they do not both want.

Nothing here is on the wire. The scores are computed from ids every peer
already knows, and in-flight HTTP loads are part of the segments announcement
independently of the election. A change to the hash changes who fetches, not what is exchanged, so
it is not a protocol change ([segment-identity.md](segment-identity.md)).
