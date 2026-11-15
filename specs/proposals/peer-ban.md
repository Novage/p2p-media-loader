# Proposal: ban a peer whose bytes fail, for a time

**Status: not adopted.** This is a candidate extension to the
[WebTorrent manager spec](../../packages/p2p-media-loader-core/src/webtorrent/webtorrent-manager/spec.md)
and [playback-contract.md](../playback-contract.md), "Urgency", recorded so that
the decision to build it can be made on measured sessions rather than on the
appeal of the idea. Nothing in the system bans a peer today.

## The gap it closes

A peer whose bytes prove wrong is closed: its segment fails
`validateP2PSegment`, its size contradicts the size HTTP or the byte range
gives, or HTTP that went on from its bytes finds them wrong. Nothing remembers
it. The WebTorrent manager's `#claimPeer` turns a peer away only when it is
already connected or connecting, or when the peer limit is reached, so the same
peer is accepted again at its next tracker announce, within about two minutes,
and an offer of ours can reach it before that.

It still announces the segment it sent wrong, so it can be asked for it and
fail again. Each repeat costs a download and either a P2P timeout or an HTTP
round trip for the request, and a peer with a lasting defect — a broken storage,
a bug that corrupts what it uploads — repeats it for the whole session.

## Design

**A ban list in each core.** The list holds a peer id and the time its ban
ends. Every close for wrong bytes adds the peer: the `validation-failed` and
`bytes-length-mismatch` closes in `Peer`, and the close that HTTP asks for
through `P2PLoader.closePeerWithBadData`. A close for a
`p2p-segment-size-conflict` adds no one, since nothing tells which of the two
peers was wrong.

**Turning a peer away.** `#claimPeer` refuses a banned peer, as it refuses one
already connected, and the client does not answer its offers. Each refusal is
counted (`PeerBan:refused`), and each ban (`PeerBan:added`).

**How long.** A fixed time, for example ten minutes, not the session: the cause
can be a passing defect, and an entry stays only while it is useful. A second
ban of the same peer could last longer.

**A smaller alternative.** Remember only that this peer's copy of a segment is
bad, and do not ask it for that segment again. That stops the repeated failure
and keeps the peer for its other segments, but it does not stop a peer whose
storage corrupts every segment.

## Limits

A peer chooses its own id, so a ban stops a peer with a defect, which keeps its
id, but not one that sends bad data on purpose and comes back with a new id.
Validation, and HTTP as the source of truth, remain the defence against that;
the ban only saves the cost of repeats.

## How to decide

Closed peers are counted by cause (`PeerClosed:validation-failed`,
`PeerClosed:bytes-length-mismatch`), and the P2P loader logs each disconnect
with the peer id under `p2pml-core:webtorrent-manager`.

1. Collect diagnostics snapshots and that log from real sessions with
   `validateP2PSegment` set, on swarms of more than a few peers.
2. Count the closes for wrong bytes, and of those, the peer ids closed more
   than once in one session.

**Implement** the ban when the same peer ids are closed again and again, which
means peers with a lasting defect come back. **Implement the smaller
alternative** when repeats are mostly for one segment of a peer. **Do not
implement** when closes for wrong bytes are rare, or almost never repeat for one
peer id.
