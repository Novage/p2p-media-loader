# Playback contract

Core needs two things from the player: **where it is** in the stream, and **how
urgently** it needs the segment it just asked for. The first is already known —
the last requested segment says it. This spec is mostly about the second, and
about doing both without ever comparing a manifest time to a player time.

## The problem

Segment times come from the manifest. The playhead comes from the player. These
are different timebases, separated by an offset that core cannot derive:

- **HLS** — the player anchors its timeline on PTS after transmuxing; the media
  need not begin at zero.
- **DASH** — `presentationTimeOffset`, period start and `availabilityStartTime`
  all shift it.
- **Live** — the anchor depends on where in the sliding window the player
  started.

The offset also drifts, and changes at discontinuities. Measuring it is possible
but fragile, and every consumer of the measurement inherits its error.

## The contract

```ts
type PlaybackState = {
  /**
   * Seconds of contiguous media buffered ahead of the playhead.
   * Zero when the playhead sits in a gap.
   */
  readonly bufferAhead: number;

  /** Effective playback rate; 0 while paused. */
  readonly rate: number;
};
```

**There is no position field, and that is the point.** `bufferAhead` is a
_duration_, so it is invariant under the offset. Combined with the last
requested segment — which core already knows, in manifest time — it is
sufficient. No calibration step exists because no absolute comparison is ever
made.

The contract is also the intersection of what every target player can answer,
which is why it is expressed this way rather than in any player's own terms.
See [player-adapters.md](player-adapters.md).

## Sources, in order of preference

| Source     | Accuracy                          | Available when                      |
| ---------- | --------------------------------- | ----------------------------------- |
| `reported` | exact                             | the integration can read the player |
| `inferred` | approximate, blind to quiet seeks | always                              |

A directly readable player always wins. In a browser the media element is free,
continuous and unconditional, so the fallback is never preferred there. A third
source — a player's own CMCD buffer report, for the proxy architecture where
nothing can read the player — is recorded as a proposal, not built; see
[proposals/cmcd-playback-source.md](proposals/cmcd-playback-source.md).

### Staleness

A `reported` state describes one instant. Core keeps the most recent one and
treats it as current for a bounded window (on the order of a couple of
seconds); past that, it falls to inference rather than trusting a value the
player may have long moved on from. A browser adapter reporting on media events
never approaches the window while playing; a proxy that could only sample the
player once per segment would, which is why inference has to be sound on its
own.

A **paused** report (`rate` 0) does not expire. Media events stop while paused,
so nothing would refresh it, and falling to inference would decay the estimate
as though the player were still consuming — a paused viewer would look like one
about to run dry. Nothing moves while paused; the one thing that can change,
the buffer growing, fires `progress`, which reports again. The next `play`,
`seeking` or `ratechange` event replaces the paused report and ordinary
staleness resumes.

## The buffer edge

Core tracks `bufferEdge`: the point on the **manifest timeline** where the
player's buffer currently ends.

- When a segment is requested, the buffer ends where that segment begins — that
  is precisely why the player is requesting it. `bufferEdge = segment.startTime`.
- When the segment is delivered, the buffer extends through it.
  `bufferEdge = max(bufferEdge, segment.endTime)`.

The `max` guards against out-of-order completion of parallel requests dragging
the edge backwards.

Keeping the edge explicit rather than deriving it from the last requested
segment removes a silent one-segment-duration error: the correct origin depends
on whether that segment has been delivered yet, which differs between the
request path and everything else that reads playback state.

"Delivered" means handed to the player, not appended to its media buffer. The
edge advances only when bytes reach the player through its own request — a
background prefetch fills the core's store and leaves the player's buffer where
it was, so it must not move the edge. Because the player appends a delivered
segment a moment after receiving it, the estimate overstates the playhead by at
most one segment in that interval and the next reported state corrects it. The
same bound applies at startup, when a player issues several requests at once
before any has been appended. Neither transient accumulates.

## Distance from the playhead

The buffer edge sits exactly `bufferAhead` in front of the playhead, so:

```
distance(segment) = segment.startTime - bufferEdge + bufferAhead
```

Every term is a difference. `segment.startTime - bufferEdge` is a
manifest-space delta and exact; `bufferAhead` is a player-space duration and
offset-free. The offset between the two timebases cancels and never appears.

All scheduling decisions are expressed on this axis:

```ts
function isSegmentInTimeWindow(segment, playback, timeWindowLength) {
  const start = segment.startTime - playback.bufferEdge + playback.bufferAhead;
  const end = segment.endTime - playback.bufferEdge + playback.bufferAhead;
  return !(timeWindowLength * playback.rate < start || 0 > end);
}
```

The same axis governs the high-demand, HTTP and P2P windows, and eviction from
the segment store.

## The time windows

Three windows ahead of the playhead, each a length on the axis above, decide
what a queue pass does with a segment:

- **High-demand.** A segment inside it is one the player is about to play:
  core fetches it over HTTP at once, and moves a P2P download of it to HTTP.
- **HTTP.** A segment inside it may be prefetched over HTTP, by the peer the
  election chooses ([prefetch.md](prefetch.md)).
- **P2P.** A segment inside it is taken over P2P from any peer that has it.

The HTTP and P2P windows are `httpDownloadTimeWindow` and
`p2pDownloadTimeWindow`, and at their defaults they reach the whole stream; on
live the playlist bounds them. The high-demand window is `highDemandTimeWindow`
off live, or 15 seconds where that is unconfigured. On live it is derived from
the geometry of the window itself, by the rule the core exports as
`highDemandWindowFor`:

```
liveDelay    = liveDelayFromWindow(window, segment)   // one segment inside the tail, at most a minute
playerBuffer = max(2 × segment, liveDelay − segment)   // one segment short of the edge
highDemand   = min(configured ?? 15, playerBuffer / 2)   // and at least a segment where nothing is configured
```

On live the configured number is a ceiling rather than an override. Nothing
configured here widens the player's buffer, which every adapter sizes from the
geometry, so a window configured past half that buffer would cover everything
the player fetches and leave the election nothing — the failure this rule
exists to prevent. A number still narrows the window, which gives peers more
room rather than less. An integration that wants the player to fetch over HTTP
regardless asks for that with `isP2PDisabled`.

The player's forward buffer is what every adapter sizes to `playerBuffer`
([player-adapters.md](player-adapters.md)); the core calls the nearer half of
it high-demand and leaves the farther half to the election. That order is the
invariant this design rests on: **the player's buffer must reach further than
the high-demand window, by more than a handoff costs** — one peer's playlist
refresh ahead of another's, one HTTP fetch, one P2P transfer. A buffer at or
inside the window makes every segment the player fetches high-demand on
arrival, so each peer fetches the whole stream from the origin and the election
never has a segment to run on. A four-segment playlist of five-second segments
is the tight case: delay 15 s, buffer 10 s, window 5 s, and 5 s of room.

A window narrower than that has no room to give, whatever an adapter does: a
player needs two segments of buffer to keep going, and on a window of two or
three segments that floor already reaches the live edge or just past it. The
adapters differ there only in how they lose it — the HLS.js adapter leaves
such a playlist to HLS.js's own defaults, while the dash.js and Shaka adapters
apply the floor, which still sits nearer the edge than the default it
replaces. Such a window is transient in practice, a channel whose playlist has
only just started publishing.

The window is derived from the presentation's placement, not from each
stream's own playlist: the widest live main stream decides, and the widest live
stream of any kind where there is no main one — the same stream the adapters
size the player by. An audio playlist often carries a wider window than the
video's, and a window derived from it would exceed the buffer the player
actually holds.

Because the player buffers further than the window on live, the segment the
player asks for is often not high-demand when it asks. That request is a
candidate like any other for the election, which the owner fetches at once and
a backup by its deadline. With no peer connected there is no owner and nothing
to take the segment from, so core fetches the player's request over HTTP at
once rather than let it wait for the window to reach it.

The windows scale with the playback rate: at twice normal speed the derived
window covers twice the media. Live players hold the rate at one outside their
own catch-up, so this rarely matters there.

## What the segment store receives

`SegmentStorage` is public API — an integration may supply its own through
`customSegmentStorageFactory` — so it is worth being explicit about what one is
given.

The store is told the playhead through `onPlaybackUpdated(position, rate)`, and
it compares that position against the `startTime` and `endTime` it was given
when each segment was stored. **Both sides of that comparison are manifest
time.** The position core passes is derived, not the player's clock:

```
position = bufferEdge - bufferAhead
```

Each loader reports the playhead on its own stream's timeline, and the store
keeps the latest report. The store is told at the start of a stream and
whenever the core's estimate moves — on a player's report, and on the core's
own inference where the player reports nothing — so a store sees positions,
and evicts, on a session where `updatePlayback` is never called. On live HLS
without programme dates the main and the secondary playlist are anchored at
zero on their own first parse, so their timelines can differ by seconds; a
segment of one judged against the other's position is then off by that much,
inside the trailing window the store keeps on a live stream. That window is
three segments, measured in the segment's own length, and never less than
fifteen seconds. The segments are what peers need of each other: they sit
within a second or two on one stream, and a peer a little behind another must
still find what it wants held. The floor is for the skew above, which is a
fixed offset rather than a count of segments, and on a stream of short segments
would otherwise fall outside a window measured in them. Neither term follows a
configured window — the high-demand window is sized for scheduling ahead of the
playhead and can be as short as one segment. A position kept per stream or per type would be exact while
both report and would freeze the moment one stops, retaining its segments for
ever, so the store does not. Both values sit on the manifest timeline, which is
what keeps the comparison valid, and is why neither of them is
`video.currentTime`.

A custom store that only ever compares the position it is given against the
segment times it was given is unaffected. A custom store that mixes in a
player-sourced time — reading `currentTime` itself, or persisting positions
across sessions against wall-clock — is comparing two timebases and will be
wrong by the offset this design exists to avoid.

## Behaviour under seeking

| Situation                                         | Outcome                                                                                                                                                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seek forward into unbuffered media                | Buffer discarded, player requests at the new position, `bufferAhead` is 0. Exact, and urgency correctly maxes out.                                                                                                                 |
| Seek backward into unbuffered media               | Same. Exact.                                                                                                                                                                                                                       |
| Seek backward **inside** the buffer               | No request is issued at all. The edge is unchanged and `bufferAhead` has grown by exactly the distance seeked, so the two cancel. Exact.                                                                                           |
| Seek across a gap into an earlier buffered island | The edge describes a later island while `bufferAhead` is measured in an earlier one. Wrong until the player issues a request, which it does immediately to extend the range it is now playing. Self-correcting within one request. |

The third row is the one that motivates the design. Both terms are anchored to
the same buffer edge, so seeking within a buffered range needs no new
information from the player and produces no error.

## When the player reports nothing

Some integrations cannot wrap the player — a proxy that a native application
points at, with no SDK around its player. Core then infers `PlaybackState` from
the request pattern it already observes. Inference is a fallback _inside_ core,
not a second contract: an adapter's only job is to report if it can and stay
silent if it cannot.

Inference re-anchors on three reliable events and integrates between them:

- **Report** — an integration that reports at all reports the truth, so the
  most recent one anchors inference too. An integration that samples its player
  rarely — a proxy once per segment — spends most of its time inferred, and
  each of those stretches then starts from a measurement seconds old rather
  than from whichever seek or idle gap last anchored it.
- **Seek** — a requested segment that does not continue the previous one on
  the timeline — its start is not the previous end, within half a segment —
  means the player jumped, and a jump means its buffer was discarded.
  `bufferAhead` resets to zero. Continuity is judged on time, not on
  `externalId`, whose step is one for HLS but a segment's length in 100 ms
  units for DASH (see [segment-identity.md](segment-identity.md)).
- **Buffer full** — a sequential request arriving after an idle gap longer than
  a fraction of a segment duration means the player was not fetching because it
  had nowhere to put the data. `bufferAhead` is at the player's target, which is
  itself learned as a moving average of the estimate at these moments.
- **Between anchors** — delivered media time minus elapsed wall-clock time,
  clamped to the learned target.

The learned target is not taken from reports: a report arriving mid-fill is
below the player's target and would drag it down. It stays what the idle gaps
say it is.

Inferred estimates are scaled down by a safety factor before use.
Underestimating the buffer costs P2P ratio; overestimating it stalls the viewer.
The bias is deliberately toward the cheaper failure.

Playback rate is ambiguous when inferring and is assumed to be 1. This is safe:
assuming playback decays the estimate, which only ever makes core more willing
to use HTTP, and core acts only when a request arrives, so a paused player costs
nothing.

### Limits of inference

**A seek that issues no requests is invisible.** Seeking backward inside a
buffered range produces no network activity, so inference cannot detect it and
its estimate stays wrong until the player next requests something. Reported
state handles this case exactly.

Inference is a graceful degradation, not an equivalent. Any integration that can
report playback state should.
