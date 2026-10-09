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

  /**
   * How many seeks the player has started since it began playing this
   * source. Optional: an integration that cannot see seeks leaves it out.
   */
  readonly seekCount?: number;
};
```

**There is no position field, and that is the point.** `bufferAhead` is a
_duration_, so it is invariant under the offset. Combined with the last
requested segment — which core already knows, in manifest time — it is
sufficient. No calibration step exists because no absolute comparison is ever
made.

**`seekCount` is a count, not a flag.** A seek begins before the player
requests anything at its new position, and core must know at once that the
buffer it was told about is gone (see "Behaviour under seeking"). A browser
adapter counts the media element's `seeking` events. A native shim counts the
player's own seek events — ExoPlayer's `onPositionDiscontinuity` with
`DISCONTINUITY_REASON_SEEK`, AVPlayer's `AVPlayerItem.timeJumpedNotification`
— and posts the state on an interval ([mobile-proxy.md](mobile-proxy.md)). A
seek can begin and end between two such posts; a flag would miss it, and a
count that has moved cannot.

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

Core tracks `bufferEdge`, for each stream: the point on the **manifest
timeline** where the player's buffer of that stream currently ends.

- When a segment is requested that extends the buffer, the buffer ends where
  that segment begins — that is precisely why the player is requesting it.
  `bufferEdge = segment.startTime`.
- When the segment is delivered, the buffer extends through it.
  `bufferEdge = max(bufferEdge, segment.endTime)`.
- After a seek, the stream's first request re-anchors the edge wherever it is:
  `bufferEdge = segment.startTime`.
- A request for a segment that starts before the edge, with no seek between
  and after the request that set the edge was delivered, is not a move: the
  player is fetching again media it holds — dash.js replaces segments it
  buffered at a higher quality this way. The edge stays. Moving it back would
  make every segment of the stream look further from the playhead than it is,
  the direction that stalls; measured on dash.js, it put the estimate 16 s
  behind.
- After a request the player abandoned before it was delivered, a request
  before the edge is a move, and re-anchors the edge as a seek does: the
  player never held media up to that edge. HLS.js does this as it starts a
  live stream — it asked for the live edge, aborted, and asked 14 s earlier,
  with no seek reported. Kept, the edge put the playhead past the request.

The `max` guards against out-of-order completion of parallel requests dragging
the edge backwards.

Telling a re-request from a seek takes the seek count. Where the integration
reports one, a request before the edge is a seek's first request when the count
has moved since the stream's previous request, and a re-request when it has
not. Where it reports none, the two cannot be told apart: a seek back into an
earlier buffered island asks for a segment before the edge with a full buffer
reported, exactly as a re-request does, and a re-request taken for a seek costs
a stream a playhead behind until it requests past the edge again, where a seek
taken for a re-request leaves it ahead until playback reaches the edge, minutes
later. So without a count, as with inference, a request that does not continue
the stream is taken for a seek, as before (see "When the player reports
nothing"), and re-requests keep that error.

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

## One playhead for all streams

`bufferAhead` is one number, and a presentation with separate audio has two
buffers. What every player reports is the shorter of them, the lagging
stream's: the time until playback runs out of data, which is set by whichever
stream runs out first.

- **Browsers.** The media element's `buffered` is, by the Media Source
  Extensions specification, the intersection of the active SourceBuffers. With
  HLS.js, dash.js and Shaka on DASH and on HLS with separate audio, the end of
  the element's range was `min(audio end, video end)` in every sample, in both
  directions. The one exception the specification makes is after
  `endOfStream()`, at the end of a VOD stream, where each buffer's last range
  counts to the highest end.
- **ExoPlayer.** Its buffered position is the minimum over the audio and video
  loaders, leaving out a track that has loaded to its end
  (`CompositeSequenceableLoader.getBufferedPositionUs`).
- **AVPlayer.** `loadedTimeRanges` is not documented per track. Measured in
  Safari, whose native HLS is AVFoundation, it never went past the lagging
  stream while audio ran up to 13 s ahead.

So `bufferEdge - bufferAhead` is the playhead only for the lagging stream. For
the stream that runs ahead it lands ahead of the playhead by that stream's
lead, and the error moves: forward by a segment each time that stream's
segment arrives, back by a segment each time the lagging stream's does.
Every next segment of the leading stream then looks needed sooner than it is,
by the lead, and is fetched over HTTP, or given to a backup, while its P2P copy
could still have arrived. Measured: 4 s on average for dash.js audio, up to
34 s for HLS.js audio.

Core therefore keeps one playhead for all the streams of a presentation:

```
playhead = min(bufferEdge of each current stream) - bufferAhead
```

The lagging stream's edge is the minimum and its buffer is `bufferAhead`, so
this is the playhead, and a stream's own buffer is `bufferEdge - playhead`.
Nothing jumps: a segment of the leading stream moves neither the minimum nor
`bufferAhead`, and one of the lagging stream moves both by the same amount.
Measured against the true SourceBuffers, it put video within 0.1 s on DASH and
HLS, and dash.js audio within 0.03 s on average. What remains is the
delivered-not-appended transient of "The buffer edge": HLS.js keeps a delivered
audio segment for up to about 3 s before appending it, and for that time the
audio buffer reads one segment long.

A stream is current, and takes part in the minimum, only when:

- **its timeline is the others'.** DASH places every stream on the MPD's
  timeline; HLS does with `EXT-X-PROGRAM-DATE-TIME`. On HLS without programme
  dates each playlist is anchored at zero on its own first parse, the edges
  differ by an unknown offset, and each stream keeps its own estimate,
  `bufferEdge - bufferAhead`;
- **its edge is re-anchored since the last seek into unbuffered media.** Until
  the stream's first request after such a seek its edge describes the old
  position (see "Behaviour under seeking"); taken as the minimum, it would move
  every other stream's playhead there;
- **core sees its requests.** A stream type whose requests pass the core by —
  its P2P switched off, or segments the registry does not list — has an edge
  that stops while playback goes on, and would hold the minimum where it
  stopped.

With one stream, or one current stream, the playhead is that stream's own
estimate, as before.

**The end of a VOD stream.** `bufferAhead` stops being the minimum only where
nothing is left to fetch. A Media Source player calls `endOfStream()` once it
has appended every segment of every stream, and from then on the element counts
each buffer's last range to the highest end of them: the playhead comes out
low by the difference between the streams' ends, typically less than a
segment, and that moves only the store's position, by as much. ExoPlayer leaves
a track that has loaded to its end out of its buffered position while another
still loads; that track's edge is at its end, past every other, so it is never
the minimum, and the playhead stays right. A stream that has requested its
last segment therefore keeps its place in the minimum, and needs no rule of its
own.

## Distance from the playhead

The playhead of the section above sits `bufferEdge - playhead` behind each
stream's buffer edge, so:

```
distance(segment) = segment.startTime - playhead
                  = segment.startTime - min(bufferEdge) + bufferAhead
```

Every term is a difference. `segment.startTime - min(bufferEdge)` is a
manifest-space delta and exact; `bufferAhead` is a player-space duration and
offset-free. The offset between the two timebases cancels and never appears.
With one stream, `min(bufferEdge)` is its own edge.

All scheduling decisions are expressed on this axis:

```ts
function isSegmentInTimeWindow(segment, playback, timeWindowLength) {
  const start = segment.startTime - playback.playhead;
  const end = segment.endTime - playback.playhead;
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
maxLatency   = liveDelay + 2 × segment                  // re-synced to liveDelay past this
```

`window` is the span of the listed segments, from the earliest start to the
latest end, and `segment` their average length. A DASH
`SegmentTemplate@duration` is the exception. It lists every segment that has
ended since `timeShiftBufferDepth` ago, and whether the first of them started
inside that window or a segment before it depends on the moment of the parse:
on a 60 s window of 8 s segments the span is 56 s at one moment and 64 s at
another, and the placement sized from it 48 s or 56 s — different on two peers,
and different on one peer after a pause. Its `window` is the one the MPD
declares, `timeShiftBufferDepth`, or the time since its period began where that
is shorter; the parser reports it as `declaredWindow`, and `liveDelayFor` uses
it.

A pause or a stall leaves the playhead where it was while the window moves on,
and the player's buffer, which ends a fixed distance ahead of the playhead,
reaches back toward the tail with it. Past `maxLatency`, the core's
`maxLiveLatencyFor`, the player is brought back to its delay: at that distance
the buffer still ends inside the window, so its next request is still for a
segment the registry lists. A player left further behind fetches every segment
over HTTP and shares none of them, and once its next segment has left the
window it has nothing left to fetch at all. On a DVR window wider than
`maxLatency` the adapters raise the threshold to the window: a viewer who
rewound into the window chose that position, and is left there until a pause
carries them out of the window. HLS.js checks its threshold on every playlist
refresh, whatever put the playhead there, so a threshold at `maxLatency` would
pull such a viewer back within a refresh.

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
position = playhead = min(bufferEdge) - bufferAhead
```

Where the streams share a timeline, every loader reports this one playhead, so
the store's position no longer flips between the lagging stream's and the
leading one's at each report — which, on a lead of 30 s, would drop segments
30 s early behind the playhead, ones a peer a little behind still wants. On HLS
without programme dates each loader reports its own stream's estimate, on its
own timeline, and the store keeps the latest report. The store is told at the
start of a stream and
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

The store is also told, through `onSegmentsRemoved`, when a refreshed manifest
no longer lists segments of a stream: a live window has moved past them.
Nothing can request such a segment again. The core matches every request
through the segments the manifests list, and a peer asks only for what its own
manifest lists, so a stored copy can never be served. The store may drop it at
once, wherever the playhead is, and the bundled one does. The trailing window
alone is not enough for a paused player: its playhead does not move, so every
segment ends after it, and on a live stream with peers the core goes on
fetching this peer's share of each new one — a paused peer still owns segments
in the election, and its neighbours would otherwise wait for a backup. Each
such segment would be kept until the storage brake stopped it. Dropping what
leaves the window bounds the store by the window instead, while the peer goes
on seeding. For a playing peer the rule changes nothing, since everything it
keeps is inside the window. The core reports a segment by identity, not by URL:
a CDN that signs every refresh's URLs anew changes a segment's key and nothing
else, and that segment has not left. The method is optional, so a custom store
without it keeps such segments until its own rules let them go.

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

**Between the seek and each stream's first request, the old edges lie.** The
rows above are exact once each stream has requested at its new position, but
the streams do not request together, and the player reports first. Measured:

- The `seeking` report arrives before any request, with `bufferAhead` near 0 at
  an unbuffered target. Every loader still has its old edge, so it reads an
  empty buffer at the old position and may start an urgent HTTP download
  there — HLS.js video got one, at the position it had left, 8 ms before its
  own first request.
- One stream requests before the other. dash.js video requested at the target
  after 19 ms, and in the millisecond before its audio did, core started two
  audio downloads at the old position. HLS.js audio followed its video by about
  a second.

These were cancelled before any byte arrived, but a later request, or a peer
that answers, makes them real downloads of media nobody will play, and with the
roles reversed they are video. So when the reported `seekCount` changes and the
report shows no media at the new position, every stream's edge stops counting:
its loader starts no prefetch, and its edge takes no part in the shared
playhead, until its own first request after the seek re-anchors it. The report
of the seek decides this, not a later one: once one stream's media arrives at
the new position, the player reports a buffer that the other streams do not
have yet. A stream whose request has arrived already prefetches from its new
edge. The pause costs a stream only the time until its own request, and never a
download. The player's own request is fetched even while its stream is held: a
player can request the new position before the seek is reported — HLS.js did,
on a seek back into a DVR window — and that request is then taken for a
re-request. Held, it would keep the player waiting for ever.

For the same reason, a player request that the queue does not hold — behind
the estimated playhead, or past the windows — is fetched at once, and, where a
seek holds the queue or the request lies outside it, the HTTP download furthest
ahead gives way to it. The windows place prefetch; they never decide whether
the player's own request is served. Without this, a wrong estimate left the
request outside every window: HLS.js stayed at `readyState` 0 for good while
core prefetched the segments after it.

A seek into media the player holds is not paused. The player reports a buffer
at the new position at once, and may make no request for as long as that buffer
lasts — HLS.js video made none in the 8 s measured after a seek 7 s back inside
it — so a pause until the request would stop the prefetch for all that time.
After a seek inside the buffer the edges are the ones the player holds, as the
table shows; after one into an earlier island they are wrong until the request
the player makes at once. Either way, each stream's first request after the
seek re-anchors its edge, as after any other seek.

An island that runs to the end of a VOD stream brings no request at all, and
its error stays until the next seek: measured on HLS.js, 21.5 s. Nothing is
left to fetch there, so it moves only the store's position.

**The seek count is optional, and everything above works without it.** An
integration that reports none — a native shim that does not count seeks, a
player read some other way — keeps the behaviour before it: core learns of a
seek from each stream's first request at the new position, any request that
does not continue the stream counts as one, and until that request the old
edges count, so the downloads measured above can still start. They are bounded
by that short window. The shared playhead works as with a count, in regular
playback, which is most of it.

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
