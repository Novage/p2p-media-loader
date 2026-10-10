# Playback contract

Core needs two things from the player: **where it is** in the stream, and **how
urgently** it needs the segment it asked for. Both come from what the player
does and says, never from an estimate. The player's last request gives the
position. The buffer that the player reports gives the urgency. Core never
estimates a playhead, and never compares a manifest time to a player time.

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

A playhead estimated on the manifest timeline, from the requests and the
reported buffer, avoids the offset but has errors of its own. It is wrong after
a seek until the player requests again, and wrong after a seek next to a
buffered island for as long as the island lasts. Each fix needs more state:
seek detection, re-request detection, delivery tracking. So core keeps no
playhead at all.

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
_duration_, so it is invariant under the offset. Core uses it for one decision
only: whether a request the player has made is urgent. No calibration step
exists because no absolute comparison is ever made.

**Every integration reports.** A browser adapter reports from the media
element, through `trackMediaElementPlayback`. A native integration reports from
its player through a shim ([mobile-proxy.md](mobile-proxy.md)). Before the
first report, core takes `bufferAhead` as 0 and `rate` as 1: the player has
nothing buffered yet, so its first requests are urgent. A stream that starts
later than the others — the audio of a presentation, say — starts from the
last report, aged since it was made. An integration that
never reports still plays by the same rule. Every request that the store cannot
serve is urgent and goes over HTTP, so such a player gets from peers only what
prefetch puts in the store first.

The contract is also the intersection of what every target player can answer,
which is why it is expressed this way rather than in any player's own terms.
See [player-adapters.md](player-adapters.md).

### The age of a report

A report describes one instant. Between two reports the player consumes media
at its rate, so core uses:

```
bufferAhead now = max(0, reported bufferAhead − seconds since the report × rate)
```

A browser adapter reports on media events, several times a second while
playing, so this changes almost nothing there. It matters when reports stop: a
player that went away without a word, or a shim that posts on an interval.
Without it, a frozen report of a full buffer would keep a request waiting for
a buffer that is long gone. A paused report (`rate` 0) does not age: a paused
player consumes nothing. The next report replaces it.

### One buffer for all streams

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
  counts to the highest end. Nothing is left to fetch then.
- **ExoPlayer.** Its buffered position is the minimum over the audio and video
  loaders, leaving out a track that has loaded to its end
  (`CompositeSequenceableLoader.getBufferedPositionUs`).
- **AVPlayer.** `loadedTimeRanges` is not documented per track. Measured in
  Safari, whose native HLS is AVFoundation, it never went past the lagging
  stream while audio ran up to 13 s ahead.

Core judges the requests of every stream by this one buffer. For the stream
that runs ahead, its own buffer is longer by its lead, so its request can be
urgent when it need not be. The error is always toward urgent: the cost is an
HTTP download that P2P could have made, and only while the buffer is low — at
the start, after a seek, in a stall — where HTTP is the right choice anyway.

Core does not correct for the lead. A correction compares the streams'
positions, and after a seek one stream's position is old until that stream
requests at the new place. Measured, the second stream's first request came
19 ms after the first on dash.js, and about a second after it for HLS.js audio.
Taken as the lowest position, an old one makes the other stream's seek request
look far from the playhead and not urgent, and the player waits for it.
Preventing that needs seek detection, which is what this design removes.

## The position

Each stream's position is the segment its player requested last, on the
manifest timeline. The player requests a segment because its buffer ends
there, so in steady playback the position is where the player's buffer ends:
ahead of the playhead by `bufferAhead`.

The position is a fact, not an estimate. Every request moves it, whatever kind
of request it is:

- **A request that continues the stream** moves it forward by a segment.
- **A request after a seek** moves it to the new place.
- **A request for media the player holds** moves it back. dash.js replaces
  segments that it buffered at a lower quality this way. The queue then
  continues from there, at the quality the player asks for now.

Core does not tell these apart, and needs no seek count, no delivery state and
no re-anchoring to do so.

Each stream keeps its own position. The streams are not compared (see "One
buffer for all streams").

## Urgency

A player request is **urgent** when the store cannot serve it and

```
bufferAhead now < urgentBufferThreshold × rate
```

`rate` here is the last non-zero rate the player reported, and 1 before any.
A paused player with an empty buffer still has a request that is urgent: a
paused player that asks for media wants its first frame.

- **An urgent request** is fetched over HTTP at once. If every HTTP slot is in
  use, the HTTP prefetch download furthest ahead stops and gives its slot to
  the request. A P2P download of the request that is under way moves to HTTP.
  Where HTTP is not allowed — during `httpDownloadInitialTimeoutMs`, or once
  the request's HTTP attempts are spent — it is taken from a peer that has it,
  and takes a P2P slot from prefetch the same way.
- **A request that is not urgent** is fetched from a peer that has the
  segment. If no peer has it, the election decides who fetches it over HTTP
  ([prefetch.md](prefetch.md)). Otherwise it waits.
- **With no peer connected**, a request is fetched over HTTP at once. Nobody
  can give the segment, and no election runs.

Core judges a waiting request again on every report and on the prefetch timer
([prefetch.md](prefetch.md), "Backups"). The buffer drains while the request
waits, so a request that waits too long becomes urgent and goes over HTTP. A
player's request therefore never waits longer than its buffer allows.

**Nothing else is urgent.** A segment that the player has not requested is
never fetched as urgent, wherever it is. A segment is needed now only when the
player asks for it with a low buffer. Any other guess of "needed now" rests on
a playhead that core does not know, and after a seek it would put the urgent
region where the player was, not where it is.

**A player with P2P is never slower than without it, on the same player
parameters.** Without P2P, the player fetches each request over HTTP as soon as
it makes it; how many requests it makes, and when, its own parameters decide.
An urgent request does the same: it waits for no slot, no peer and no window.
A request that is not urgent may wait for P2P, but only while the buffer is
above the threshold, so playback does not suffer from the wait. Core does not
try to be faster than the player alone, for example by fetching over HTTP, for
itself, segments its player has not asked for: that spends the HTTP bytes P2P
exists to save. Such a segment comes over HTTP only through the election, once
for the whole swarm ([prefetch.md](prefetch.md)). The one delay is the integrator's own choice: `httpDownloadInitialTimeoutMs`
holds HTTP back at the start of a stream.

**A request inside the buffer.** For a request that continues the stream, the
requested segment is at the end of the buffer, so `bufferAhead` is the time
until the player needs it. A request for media the player holds — a quality
replacement — is played sooner than the buffer runs out. Its urgency is judged
by the whole buffer all the same. If P2P does not deliver it in time, the
player keeps the copy it holds: the cost is quality for that segment, never a
stall.

## The time windows

Two windows ahead of each stream's position decide what a queue pass prefetches
for that stream:

```
distance(segment) = segment.startTime − position     // both on the manifest timeline
inside(window)    = distance ≤ window × rate
```

- **HTTP.** A segment inside it may be prefetched over HTTP, by the peer the
  election chooses ([prefetch.md](prefetch.md)).
- **P2P.** A segment inside it is taken over P2P from any peer that has it.

They are `httpDownloadTimeWindow` and `p2pDownloadTimeWindow`, and at their
defaults they reach the whole stream; on live the playlist bounds them. The
queue starts at the requested segment, so a window never reaches behind the
position. When the store runs short of space, the windows shrink: at 10 % free
the P2P window falls to the HTTP window, and at 5 % free both are 0.

The windows scale with the playback rate: at twice normal speed they cover
twice the media. A paused player keeps the last non-zero rate, so prefetch
continues while paused: a viewer who pauses and resumes finds the buffer
ready, where a rate of nothing would collapse every window to the requested
segment. Live players hold the rate at one outside their own catch-up, so this
rarely matters there.

## The urgency threshold

`urgentBufferThreshold` is the buffer below which a request is urgent. Off live
it is the configured value, or 15 seconds where none is configured. On live it
is derived from the geometry of the window itself, by the rule the core exports
as `urgentBufferThresholdFor`:

```
liveDelay    = liveDelayFromWindow(window, segment)   // one segment inside the tail, at most a minute
playerBuffer = max(2 × segment, liveDelay − segment)   // one segment short of the edge
threshold    = min(configured ?? 15, playerBuffer / 2)  // and at least a segment where nothing is configured
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
geometry, so a threshold configured past half that buffer would make every
request urgent and leave the election nothing — the failure this rule exists to
prevent. A number still lowers the threshold, which gives peers more room
rather than less. An integration that wants the player to fetch over HTTP
regardless asks for that with `isP2PDisabled`.

The player's forward buffer is what every adapter sizes to `playerBuffer`
([player-adapters.md](player-adapters.md)). The player asks for a segment when
its buffer has room for one more, so it asks with a buffer near
`playerBuffer − segment`. The request is not urgent until the buffer drains to
the threshold, and that time is the room peers have to hand the segment over.
That order is the invariant this design rests on: **the player's buffer must
reach further than the urgency threshold, by more than a handoff costs** — one
peer's playlist refresh ahead of another's, one HTTP fetch, one P2P transfer. A
buffer at or below the threshold makes every request urgent when it is made, so
each peer fetches the whole stream from the origin and the election never has a
segment to run on. A four-segment playlist of five-second segments is the tight
case: delay 15 s, buffer 10 s, threshold 5 s, and 5 s of room.

A window narrower than that has no room to give, whatever an adapter does: a
player needs two segments of buffer to keep going, and on a window of two or
three segments that floor already reaches the live edge or just past it. The
adapters differ there only in how they lose it — the HLS.js adapter leaves
such a playlist to HLS.js's own defaults, while the dash.js and Shaka adapters
apply the floor, which still sits nearer the edge than the default it
replaces. Such a window is transient in practice, a channel whose playlist has
only just started publishing.

The threshold is derived from the presentation's placement, not from each
stream's own playlist: the widest live main stream decides, and the widest live
stream of any kind where there is no main one — the same stream the adapters
size the player by. An audio playlist often carries a wider window than the
video's, and a threshold derived from it would exceed the buffer the player
actually holds.

Off live, the adapters hold the player's buffer to the threshold. The player
then asks for each segment with a buffer below the threshold, so each request
is urgent when it is made. Nothing bounds a VOD stream ahead of the player, so
the core prefetches beyond the player's buffer through the windows, and the
player's requests are served from the store.

## What the segment store receives

`SegmentStorage` is public API — an integration may supply its own through
`customSegmentStorageFactory` — so it is worth being explicit about what one is
given.

The store is told a position through `onPlaybackUpdated(position, rate)`, and
it compares that position against the `startTime` and `endTime` it was given
when each segment was stored. **Both sides of that comparison are manifest
time.** The position is the start of the segment that a player requested last,
of whichever stream requested last. The store is told at the start of a stream,
on every player request, and on every change of the reported rate.

The position is where the player's buffer ends, not where the playhead is. On
VOD the store keeps everything from the position on, and may drop the
segments the player already holds once it is full. On live the store keeps a
trailing window behind the position. Every peer measures it from its own last
request, and peers at one placement request within a second or two of each
other, so each keeps what the others still ask for. That window is three
segments, measured in the segment's own length, and never less than fifteen
seconds. The floor is for a skew between timelines: on live HLS without
programme dates the main and the secondary playlist are anchored at zero on
their own first parse, so their timelines can differ by seconds, and a segment
of one judged against the other's position is off by that much. That skew is a
fixed offset rather than a count of segments, and on a stream of short
segments it would otherwise fall outside a window measured in them. Neither
term follows the urgency threshold, which is sized for requests and can be as
short as one segment. A position kept per stream or per type would freeze the
moment one stream stops requesting, and retain its segments for ever, so the
store keeps one, the latest. Both values sit on the manifest timeline, which is
what keeps the comparison valid, and is why neither of them is
`video.currentTime`.

The store is also told, through `onSegmentsRemoved`, when a refreshed manifest
no longer lists segments of a stream: a live window has moved past them.
Nothing can request such a segment again. The core matches every request
through the segments the manifests list, and a peer asks only for what its own
manifest lists, so a stored copy can never be served. The store may drop it at
once, wherever the position is, and the bundled one does. The trailing window
alone is not enough for a paused player: its position does not move, so every
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

Core does not detect seeks. A seek reaches it as a report and, usually, a
request at the new place:

| Seek                                         | What core receives                                                      | Outcome                                                                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Into unbuffered media, forward or back       | A report with `bufferAhead` 0, then a request at the new place          | The request is urgent and goes over HTTP at once. The position moves to it.                                          |
| Back inside the buffer                       | A report with a longer buffer, and no request                           | Nothing changes. The player's next request continues from the position.                                              |
| Into an earlier buffered island              | A request after the island's end, at once                               | The position moves to it. Its urgency is judged by the island's buffer.                                              |
| To just before a buffered island             | A request in the gap, with `bufferAhead` 0; later, one after the island | The gap request is urgent. The position stays at the gap until the next request; the windows ahead cover the island. |
| Into an island that runs to the end of a VOD | Nothing                                                                 | The position stays. Prefetch continues after it, bounded by the windows and the storage brake.                       |

**Between the seek and the first request**, the position is the old one, for
milliseconds to about a second (see "One buffer for all streams"). Prefetch
from the old position continues in that time, but nothing there is urgent,
because urgency belongs to a request and the player makes none there. The
first request at the new place moves the queue, and the downloads that are no
longer in it are cancelled.
