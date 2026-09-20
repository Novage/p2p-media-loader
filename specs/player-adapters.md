# Player adapters

An adapter connects one player to core. It has three responsibilities and no
others. If an adapter is doing something not on this list, that work belongs in
core.

At construction it also supplies the manifest parsers its player needs — the
one piece of configuration an adapter owns, because only it knows which
protocols its player supports. This is a static import, not a runtime choice;
see [packaging.md](packaging.md).

## 1. Feed manifest bytes to core

Hook the player's manifest/playlist loading and pass every response body to
`core.processManifest({ url, requestedUrl, data })` before or as the player
consumes it: `url` is where the response came from, which its URIs resolve
against, and `requestedUrl` is what the player asked for.

Do not fetch manifests separately — see the rationale in
[architecture.md](architecture.md).

**An adapter whose player follows `PatchLocation` removes the element from the
MPD it passes on.** The element names a document describing the next refresh as
a diff against the MPD the player holds, and a player that follows it — dash.js
and Shaka both do — stops fetching whole manifests. Every refresh after the
first would then be a patch the core cannot read: the registry would freeze at
the window the first MPD described while playback continued on the patched one,
and P2P would fade out within a window while the stream played perfectly. The
element is an optimization over a refresh the player performs either way, so
removing it costs a manifest body per period and changes nothing else. This is
the one place an adapter alters what the player receives; the core is handed
the same bytes the player parses. `stripPatchLocation` from
`p2p-media-loader-core/dash` does it.

The same applies to a stream's segment index when it lives outside the manifest
(DASH `SegmentBase`). The player fetches it before any media; the adapter
recognises that request and hands the bytes to `core.processSegmentIndex`. It
is not a media segment and will not resolve against the registry, so it needs
recognising, not looking up. See [manifest-registry.md](manifest-registry.md).

## 2. Serve segment requests through core

Hook the player's segment loader. For each request:

```ts
if (core.isSegmentLoadable(url, byteRange)) {
  // core resolves the URL against its registry and returns bytes,
  // from a peer, from its store, or over HTTP
  const response = await core.loadSegment(url, { byteRange });
} else {
  // core does not recognise this URL: use the player's own loader
}
```

Falling back on an unrecognised URL is normal operation, not an error path. It
is what makes a disagreement between core's parse and the player's harmless.

`isSegmentLoadable` is the one check to make: it answers `false` both for a URL
the registry does not know and for a stream whose P2P is switched off, and it
reports the former through the registry-miss diagnostic.

**Cancellation is `core.abortSegmentLoading(url, byteRange)`**, which is what
every adapter here calls. A player announces an abort by calling something —
`customData.abort`, an `AbortableOperation`'s cancel, a loader's `abort()`, an
`XMLHttpRequest`'s — never by carrying a signal the adapter could pass on, so
an adapter that wanted one would have to manufacture it per request; and the
IIFE builds serve browsers older than `AbortController` (Chromium gained it in
66, the builds target 49), whose polyfill is core's own business and not
exported. `loadSegment` also takes a `signal` for an integration that already
has one and runs where the class exists. Either way the request rejects as
aborted, including while it is still waiting for the segment storage to open,
where it has no loader yet to carry the cancellation.

Naming the segment is enough to name the request: a stream's loader holds one
engine request at a time, and a new one aborts the request it replaces.

**An adapter that has reported a request as aborted delivers nothing for it
afterwards.** The core cancels what it can, but a player may abort through a
path the core never sees, and a response that is already on its way must not
reach a player that has moved on. Each adapter keeps that record itself, next
to the callbacks it is about to fire.

**Handle manifest and segment requests only, and pass every other type through
untouched.** Licence, key, certificate, timing and steering requests belong to
the player. This is a whitelist by design — the set of request types a player
emits grows over time, and an exclusion list is wrong after the next release.
See [encryption.md](encryption.md).

Two details adapters routinely get wrong:

- **Byte ranges must round-trip exactly.** A segment defined by
  `EXT-X-BYTERANGE` is identified by URL _and_ range; dropping the range
  collides distinct segments.
- **Returned buffers are the adapter's own.** Players that hand data to a
  worker for transmuxing detach the `ArrayBuffer`, and that is safe here: core
  copies at the boundary and never lets a consumer reach what it seeds
  ([architecture.md](architecture.md)). Do not clone again — the copy is
  already made, and a second one is pure cost on every segment played.

## 3. Report playback state

Push `{ bufferAhead, rate }` whenever it changes. Core exports
`getBufferAhead(ranges, currentTime)` so that the range-walking is written once
rather than per adapter.

`bufferAhead` must come from the buffered range **containing** the playhead, not
the last range. After a seek across a gap the buffer is a set of disjoint
islands, and the final island may be nowhere near the playhead.

## What adapters must not do

- Enumerate streams or describe them to core.
- Compute `externalId` or any other identity.
- Translate between the player's timeline and the manifest's.
- Tell core which variant is active — it follows from the requested segment.
- Tell core whether the stream is live — it follows from the manifest.

## Supported players

### HLS.js

- Parsers: HLS only.
- Manifest: `pLoader`, for the playlists that name streams — the master, a
  variant's media playlist, an audio rendition's. A subtitle track's playlist
  passes through it too and is not the core's to read: no master declares it
  as a stream, so the core would register the WebVTT playlist as one of its
  own.
- Segments: `fLoader`, falling back to `config.loader`.
- Playback: the media element.

A player HLS.js builds beside the primary is not this presentation. An
interstitial's ad break and trick-play I-frames each get a second `Hls`
instance made from the primary's own config, so each carries these loaders and
the core behind them, and nothing either loads reaches the engine's event
handlers. Neither their playlists nor their fragments are the core's: they name
streams no master here declared, and left alone they would stay in the registry
— one per break or rendition — and be announced in this presentation's swarm
under the identity of nothing. `primarySessionId` is what HLS.js puts on both
and on no primary, and both loaders stand aside for an instance carrying it.

What HLS.js reads back off a playlist loader it was handed, the wrapper answers
from the loader that did the work: the context of the request in flight, its
stats, and the cache age a live playlist needs to advance a blocking reload
past what the CDN already holds.

The core's stream context ends when HLS.js loads a source, and at no other
time. Attaching a media element is not a new stream: HLS.js fetches the
playlists as soon as the master is parsed, whether or not an element is
attached, and re-attaches one of its own accord — `recoverMediaError()`
detaches and attaches to get past a media error. Letting the core go there
would drop the registry those playlists filled, and a VOD stream never fetches
them again, so every fragment after it would load over HTTP in silence.

The adapter also tunes HLS.js's own buffering, because the core's background
loader is what should fetch ahead, not the player. Every setting below is
applied only when the integrator has not configured it, and each is applied
once per value when a playlist loads; between playlists HLS.js is left alone.

- **Forward buffer.** `maxBufferLength` is held to the high-demand window. The
  segments beyond it are the core's to prefetch.
- **Position in the live window.** Every segment between the player's buffer
  and the live edge is one peers can fetch for each other, so the player is
  placed as deep in the window as it can go: the target latency, set through
  HLS.js's `targetLatency` API, is the window length less one segment, and
  never more than a minute. The player's own forward buffer is what keeps it
  safe there — the fetch positions sit a buffer length ahead of the playhead,
  well inside the window, even as jitter carries the playhead a few seconds
  past the tail. `liveMaxLatencyDuration` is set two segments beyond the
  target: a viewer who pauses or stalls that far is re-synced to the target
  before the buffer starves, a controlled skip in place of a stall and jump.
  Segment length is the playlist's average, not `EXT-X-TARGETDURATION`, which
  is an upper bound and on some streams several times the real segment.
- **Low-latency mode off.** HLS.js enables it by default; on a low-latency
  playlist it then requests partial segments, which the core deliberately does
  not register ([architecture.md](architecture.md)), so those requests would
  bypass P2P. The mixin passes `lowLatencyMode: false` unless the integrator
  sets it; an integration that constructs HLS.js itself should do the same.

**Hosted in Video.js 10.** v10 has no streaming layer of its own; its
`HlsJsAdapter` constructs HLS.js from `source.engine.hlsJs`, handed to HLS.js
untouched, and exposes the instance as a read-only `engine`. The whole
integration is two calls, with nothing added to this package:
`getConfigForHlsJs()` spread into `source.engine.hlsJs`, and
`bindHls(() => adapter.engine)` — a getter, resolved when HLS.js constructs
the playlist loader, by which time the adapter has its instance. Playback
should be pinned to MSE (`preferPlayback`): native HLS on Safari would bypass
HLS.js and with it the core. The demo's `videojs10_hls` player is this.

These settings steer only where HLS.js starts and re-syncs; where the player
then puts itself is its own business. An immediate quality switch
(`hls.currentLevel`) flushes the buffer and resumes at its former end, which
moves the playhead a buffer length towards the live edge and can leave no
window ahead of it for peers until the player drifts behind again; a switch at
the next fragment (`hls.nextLevel`) keeps the position. An integration that
cares about sharing on live streams should prefer the latter.

### Shaka Player

- Parsers: HLS and DASH — Shaka plays both.
- Manifest: a scheme plugin, filtering on `RequestType.MANIFEST`.
- Segments: the same plugin, filtering on `RequestType.SEGMENT`. A segment
  request the core recognises as a stream's external index is let through to
  Shaka's own loader and its response handed to `processSegmentIndex`, whose
  answer sizes the live placement as a manifest's does — for the next load. A
  `SegmentBase` stream registers from its MPD with no segments, so the index
  is the first description of the presentation with a measurable window, and
  it arrives after Shaka has built the timeline for this one: such a stream
  plays its first session at the pre-manifest delay.
- Playback: the media element.

The live window is sized from a main stream once one has been seen, for as
long as the source lasts. Loading another starts that over, and puts the
player back to the delay a source begins from: a source with no main stream at
all — live radio after a video stream — would otherwise be refused a
placement, and one whose first manifest carries no measurable window at all —
a live `SegmentBase` MPD registers its streams with no segments — would be
placed at the window of the source before it, which may be well outside its
own. Both happen before the core is torn down for the new source, since that
tears down an integrator's own segment storage and is free to throw, and Shaka
swallows what a listener throws. An HLS
presentation arrives a manifest at a time — the master names the variants and
the audio renditions, then each media playlist comes on its own — so a
rendition's playlist describes a presentation with no main stream in it, and
the window it offers is the audio window. The fallback to the widest stream is
for a presentation that has no main stream at all, and stops applying the
moment one shows up.

Every adapter's teardown runs each step whatever the ones before it made of
themselves. The core destroys an integrator's own segment storage as part of
it and is free to throw, and a teardown that stopped at the first failure
would leave an adapter's loaders and listeners on a player it reports as
released; running the steps independently is what prevents that, not the
order they are written in.

What failed is raised to whoever asked for the teardown, once there is
nothing left to let go of — and by then, not from the middle of it: binding a
player takes it off the engine that had it, and a failure in that release
raised early would leave the new engine holding a player it never finished
binding. Where the player itself is the caller it is logged instead of
raised: dash.js invokes its event handlers with no `try` of its own, so a
throw out of a stream teardown would abort `StreamController`'s own reset
half way and surface from the integrator's `attachSource`.

Destroying the engine runs every step of its teardown, whatever the ones
before made of themselves: the core tears down an integrator's own segment
storage there and is free to throw, and a teardown that stopped at the first
failure would leave the engine's request filter stamping every request of a
player it reports as released. The first failure is raised once there is
nothing left to let go of.

A manifest or segment index reaching the core belongs to the source it was
asked for. One still in flight when the player moves to another
source, unloads the one it had, or is let go by the engine, describes the
presentation before it: it
sizes neither the player the engine has moved to nor the one it has let go,
and it is not read into the core either. A live manifest refreshes every few
seconds, so one is usually in flight at a switch, and a core that took it
would register streams nothing plays — and, winning the race with the first
manifest of the presentation that is playing, would name the swarm after a
stream this player never asked for.

One engine serves one player: a second bound to the same player takes it over
from the first. Both would place that player and stamp its requests for cores
of their own, and the first to be destroyed would give back settings the
second is still relying on — the live placement, or native HLS, which plays
outside the networking engine where nothing can be served at all.

One place owns what the engine has done to the player it is bound to, and
what it has learned about the source playing on it — two lifetimes that have
to stay in step, since a setting given back by halves leaves a player carrying
a placement nothing manages, and knowledge carried from one source to the next
places a source by a window that is not its own.

Every setting the engine writes is given back as it was when the engine is
destroyed: the two that place the player in a live window —
`manifest.defaultPresentationDelay` and
`manifest.dash.ignoreSuggestedPresentationDelay` — and the one that keeps
playback inside the networking engine, `streaming.preferNativeHls` on Shaka 5
or `streaming.useNativeHlsOnSafari` before it, since native HLS plays where
nothing can be served. Given back only while the player is still there to take
them: a player being destroyed drops its configuration, and Shaka's
`configure` asserts it has one. Its load mode is what says so, since its
networking engine outlives the configuration by as long as the requests in
flight take to settle. A player outliving its engine would otherwise
keep a placement nothing is managing, and a second binding to that player
would read the delay the first one wrote as the integrator's own choice and
stop managing it at all. The engine leaves both alone for a player whose delay
is not Shaka's default, since that is the integrator's to set.

A served segment's response carries the download time Shaka's bandwidth
estimator expects, derived from the core's bandwidth hint as
`bytes × 8000 / bandwidth` milliseconds — wall-clock time is meaningless for a
segment that came from a peer or from storage — and never less than 1 ms.
Shaka weights each sample by its duration and divides bytes by it; a 0 ms
sample is infinity at zero weight, which its moving average turns into `NaN`,
after which every variant comparison is false and the player lurches between
renditions. A decoder that cannot switch mid-stream then fails with a decode
error, which is how the defect surfaced on a Smart TV.

Whatever the plugin does not serve itself goes to the plugin Shaka would have
chosen for that request: `HttpFetchPlugin` where
`HttpFetchPlugin.isSupported()` — `fetch` and `AbortController` both present —
`HttpXHRPlugin` otherwise, and `DataUriPlugin` for a data URI, which no HTTP
plugin is meant to open and an XHR cannot. Old Smart TV browsers have `fetch`
without `AbortController`; forcing the fetch plugin there throws inside Shaka
on the first request, before anything plays, and the IIFE bundle exists for
exactly those browsers.

The schemes are registered at Shaka's APPLICATION priority, which outranks its
own plugins, and without progress support, which Shaka's own http(s) plugins
declare. Progress support is a property of the registration, and it decides
whether Shaka arms its connection and stall timers for a request on the
scheme. Those timers are stopped and re-armed only by the plugin's progress
callback, and a core-served segment cannot report progress: the callback also
feeds Shaka's bandwidth estimator wall-clock samples and makes it discard the
`timeMs` the response carries, which is where the core's bandwidth hint goes.
Declared, the connection timeout — ten seconds by default — would be a
deadline on the whole delivery, and a segment the core is fetching over a slow
link, bytes arriving all the while, would be aborted and retried into a fatal
TIMEOUT. Undeclared, a served segment is bounded by the core's own
not-receiving-bytes fallbacks, and a request passed through to Shaka's plugin
by that plugin's own `timeout`, which the plugin applies itself.

Unregistering puts Shaka's own plugins back as Shaka registered them, rather
than leaving the schemes empty: Shaka registers its defaults once, at module
load, and a bare removal would leave every http, https and data request from
any other Shaka player on the page failing as an unsupported scheme. The
registry is one per Shaka library, shared by every player made from it, so
each `unregisterPlugins` call matches one `registerPlugins` call and the
schemes go back only when the last is matched — two players on a page, each
registering on mount and unregistering on unmount, keep P2P until the second
leaves. What is counted is calls, not engines: nothing in the adapter holds an
engine, so one dropped without `destroy()` is collected along with its player.
Binding an engine while no registration is in effect — `registerPlugins`
never called for that Shaka, or matched by `unregisterPlugins` before the
bind — is refused with an error naming the cause, rather than stamping
requests no plugin of the adapter's will read and playing on without P2P with
nothing to say why. The check is at the bind, once, not on every request: an
unmount lets the schemes go and destroys the engine in the same breath, in
whichever order its cleanups run, and an engine already bound when the schemes
go back is served by Shaka's own plugins from then on. Both the restore and
the count are all-or-nothing: what the restore needs is resolved before the
first scheme is removed, so a library missing a plugin throws with the
registry untouched, and a registration is counted only once installed, a
restore uncounted only once done.

The choice is made in one place for both paths that need it: a request of a
type the adapter passes through, and a request of a player with no engine
bound, which reaches the adapter because it registers at Shaka's APPLICATION
priority, above the PREFERRED and FALLBACK at which Shaka registers its own.

No manifest-parser decoration and no `segmentIndex` hooking. Shaka's internal
representation of the stream is not consulted.

The adapter places the player in a live window by the same rule as the HLS.js
adapter — as deep as the window allows, one segment inside the tail, never more
than a minute behind the edge — through Shaka's `defaultPresentationDelay`,
and only when the integrator has left Shaka's default in place. Shaka reads the
delay when it builds its timeline, so the value must be known before Shaka
parses the manifest: `processManifest` returns what the core read from it, the
adapter derives the delay from the widest live main stream, and it is
configured in the same continuation that handed the manifest to the core, ahead
of Shaka's own parser.

**Building the timeline is the only moment it is read.** A manifest refresh
reuses the timeline it already has, so what the adapter configures after the
first manifest of a presentation is what the next load starts from rather than
a change to the one playing. It is written on every manifest all the same, and
only when the window has moved by half a segment or more, since fractional
drift in the window length is not worth carrying forward. The exception is a
low-latency DASH stream, where Shaka applies the configured delay on every
parse unless the MPD suggests one of its own. A window that changes mid-stream
therefore does not move a playing viewer.

Shaka's buffering goal leaves the rest of the window ahead of the buffer for
peers, and its own out-of-window handling — a seek to the window start plus its
safe seek offset — covers a playhead that drifts past the tail, so no re-sync
setting is needed. The MPD's suggested delay is
ignored for the same reason HLS.js's hold-back is overridden: a server's
suggestion places the player near the edge, where there is nothing to share.

### dash.js

- Parsers: DASH only.
- Manifest and segments: the player's `XHRLoader`, replaced per player through
  `player.extend("XHRLoader", extension, true)` before the player's first
  request — `initialize()` alone makes none; `attachSource()` does.
  dash.js's `FactoryMaker` resolves the override when `HTTPLoader` first
  instantiates the loader, so it applies even though `HTTPLoader` imports the
  loader module directly; with `override` set it builds the real loader, calls
  the extension with it as `this.parent`, and takes only `load` and `abort`
  from what the extension returns. Every request dash.js makes over HTTP —
  MPD, initialization, media and index segments, licences — arrives at that
  `load`, told apart by the type of the `FragmentRequest` behind it.
- Playback: the media element, from `STREAM_INITIALIZED` on.

An MPD request goes to dash.js's own loader with its completion wrapped, so the
core reads the bytes before dash.js parses them. A media segment the registry
knows, on a stream with P2P enabled, is served by the core: the adapter fills
the response dash.js's `HTTPLoader` reads and emits two progress events, the
first at zero bytes and the second at the full length with a `time` equal to
the core's bandwidth hint — dash.js measures throughput from progress traces,
dropping the first as latency and taking the download time from the rest, and
`time` on the event replaces the wall clock, which says nothing about the
network for a segment that came from a peer or from storage. A segment request
the core recognises as a stream's external index is let through and its
response handed to `processSegmentIndex`. Everything else — initialization
segments, licences, certificates, steering, XLink — passes through untouched.
A core failure is reported as a failed response so dash.js's own retry rules
run; an abort from dash.js aborts the core request.

Every core-served request ends with exactly one of dash.js's terminal
callbacks, called once: `onloadend` for a result, `onabort` for an abort
dash.js asked for. dash.js runs its progress and completion listeners
synchronously from inside those callbacks — its own ABR abandonment handler
among them — and its event bus catches nothing, so the adapter delivers a
segment in a `try` and ends the request in a `finally`. A listener that
throws during delivery neither turns a segment dash.js already holds into a
core failure, which dash.js would fetch again, nor skips `onloadend`, which
is what takes the request off dash.js's list — a request never ended has no
watchdog, and that media type's buffer never advances again. The throw is
logged. A throw from inside one of dash.js's own terminal callbacks is
dash.js's to survive: the callback is not called a second time, and what
dash.js does after its own listener threw cannot be repaired from outside it.

**Hosted in Video.js 10.** v10's `DashAdapter` creates its dash.js player and
calls `initialize()` in its constructor, and attaches a source only when one
is set, so `bindPlayer(adapter.engine)` fits between the two with nothing
added to this package. dash.js keeps the `XHRLoader` extension a player is
first given and ignores every later one, so the adapter records which engine
drives which player and the installed extension looks that up per request:
binding a second engine replaces the entry the first left, an engine that is
destroyed removes its own, and a player nobody is bound to loads everything
through dash.js itself. A response already in flight is observed only by the
engine that asked for it. The demo's `videojs10_dashjs` player is this.

`FetchLoader` is left unhooked. dash.js routes a request to it only when
`availabilityTimeComplete === false`, so low-latency DASH falls through to the
player's own loading — the low-latency exclusion in
[architecture.md](architecture.md) at no cost.

Live streams: where the integrator left `streaming.delay.liveDelay` at dash.js's
default, the adapter places the player in the window, re-applied when the
window moves by half a segment or when anything else it writes would change —
the ceiling follows the high demand window, which is configurable at runtime.
Placement is two settings, not one.

**The player is read on the first live manifest of each source, not at bind.**
`bindPlayer` has to run before `initialize()`, and dash.js's API invites
`updateSettings` in between, so settings read at bind would be dash.js's
defaults rather than the integrator's word — and a placement decided there
would be decided against the wrong ones. Reading when the first manifest
arrives also re-arms per source: what the adapter wrote is given back when a
source ends, and the next one is taken over afresh. A live presentation whose
window cannot be measured yet — a `SegmentBase` stream before its index has
been fetched — is held at a fixed delay until a refresh can size it, rather
than left wherever dash.js puts it, which is at the edge.

- **Position in the live window.** `streaming.delay.liveDelay` is the window
  less one segment, at most a minute behind the edge — the HLS.js and Shaka
  rule, from the same `liveDelayFor` the Shaka adapter uses — and
  `useSuggestedPresentationDelay` is turned off, because a server's suggestion
  places the player near the edge where there is nothing to share.
- **Forward buffer.** `bufferTimeDefault`, `bufferTimeAtTopQuality` and
  `bufferTimeAtTopQualityLongForm` are held to the high-demand window, never
  closer to the live edge than one segment and never below two segments. The
  segments beyond it are the core's to prefetch.

The second is not a refinement of the first. A live delay places the
**playhead**; what the player fetches is a forward buffer ahead of it, and
dash.js left alone buffers `bufferTimeAtTopQualityLongForm` — a minute, since
a dynamic stream is long-form by its duration — which on a typical window is
the whole of it. The playhead then sits a delay behind the edge while the fetch
position rides the edge itself, where the registry cannot yet know the segment:
core learns of a segment when dash.js refreshes the MPD, while dash.js derives
availability from its own clock, synced to the MPD's `UTCTiming`. Every such
request misses the registry and goes to dash.js's own loader, so the stream
plays perfectly and shares nothing — visible as a stream that stops sharing
minutes in and resumes only when the player falls behind the edge again.
Each of the three settings is a ceiling: one the integrator already holds
lower is left alone.

### Video.js

- Parsers: HLS and DASH — Video.js plays both through VHS
  (`@videojs/http-streaming`), which is built on the same `m3u8-parser` and
  `mpd-parser` the core uses, so a Video.js integration and the core interpret
  a manifest through identical code.
- Manifest and segments: the `onRequest` and `onResponse` hooks VHS puts on
  each player's own xhr function, `player.tech().vhs.xhr`. VHS routes every
  request of that player — playlists, MPDs, media and initialization segments,
  keys, `sidx` — through that function, which runs the hooks and tells them
  apart by VHS's `requestType`. One engine serves one player and touches
  nothing else on the page.
- Playback: the media element behind `player.tech()`.

Playlists and MPDs are read by the response hook, which sees the bytes VHS
received, under the response URL, which follows redirects. A media segment the
registry knows, on a stream with P2P enabled, is served by the core: the
request hook puts an object of the adapter's own in `options.xhr`, which
`@videojs/xhr` drives in place of an `XMLHttpRequest` — opening it, sending it,
and reading the status and response off it — so a served segment reaches VHS
through the same path an HTTP one does. It carries a preset `bandwidth`, which
VHS's callback wrapper keeps instead of measuring one from the wall clock,
meaningless for a segment that came from a peer or from storage. Where the core
has no estimate to give — a session's first segment, before a single sample —
VHS's own is handed back rather than nothing, because an empty field is what
makes VHS measure: bytes over a delivery that took no measurable time is
`Infinity`, which VHS saves as its estimate and reads back as room for every
rendition there is. A `sidx`
response goes to `processSegmentIndex`. Initialization segments, keys, content
steering and clock sync are left alone. A core failure completes the request as
an error, which VHS retries by its own rules. An abort — VHS's, or the timeout
`@videojs/xhr` applies to every request — aborts the core request and then
completes for nobody, as an aborted `XMLHttpRequest` does; VHS does not wait on
requests it has aborted. VHS's own wrapper sets `aborted` on the request before
calling `abort`, so the adapter records a cancellation of its own rather than
reading that flag back.

**The player's hooks go on when VHS says they are ready.** VHS creates a
source's handler, its xhr function and its hook registry, fires
`xhr-hooks-ready` on the player, and only then asks for the manifest, so an
engine listening for that event covers every request of the source, its first
included. This is what the event is for. The event also marks the source as
VHS's to read, which is not the same as the request having gone out: under
`preload="none"` VHS holds it back until playback starts, and nothing may
fetch that manifest in the meantime.

A VHS too old to fire it sends that first request through the page-wide hooks
instead — `videojs.Vhs.xhr.onRequest` and `onResponse`, which VHS runs for a
player that has none of its own — so the adapter installs a pair there as well.
They match the request to a bound player by its `currentSrc()`, put that
player's own hooks on, and hand the core the manifest as it passes; they are
held per xhr function for as long as an engine that installed them is bound,
and they leave every other player alone.

A player that already carries this adapter's hooks is one VHS would not have
run the page-wide pair for, so a request that reaches them from such a player's
source came from a different player — a second, unbound one on the same URL —
and is left alone as well. Its response is a different response, and on a CDN
that signs its media playlist URLs it names playlists the bound player will
never ask for. `VideoJsP2PEngine.registerPlugins(videojs)`
is unrelated to any of this: it registers the `p2pMediaLoader` Video.js plugin
and nothing else.

**A DASH `SegmentBase` index often reaches no hook either.** Before VHS
requests the index it probes the representation's container: an open-ended
request over the media URL, with no byte range and no `requestType`, read as it
arrives and aborted the moment the container can be named. When those bytes
already cover the index's byte range, VHS takes the `sidx` from them and never
makes the `dash-sidx` request. The probe is a request the adapter cannot
recognise — it carries no range to match against the registry — and an aborted
one carries no response to read. Such a stream stays registered with no segments
of its own and its media is fetched over HTTP; a representation whose index sits
past the probe's reach is requested separately, and that request is served as
this section describes.

**Reading the manifest the player itself fetched is not an optimization.**
An adapter that fetches it a second time gets a second response, and a CDN that
signs its media playlist URLs per response — Amazon IVS does — names a
different set of playlists in each one. The core would then hold renditions the
player never asks for, and see the ones it does ask for as a stream of their
own, with no identity from any master playlist: every such viewer lands in one
swarm keyed by nothing, sharing with no player that read the manifest properly.
The adapter falls back to fetching a manifest itself only for a player whose
VHS handler already holds the source when the engine binds and has already
asked for it, since only then is that request behind the hooks rather than
ahead. A handler that holds the source has not necessarily asked: under
`preload="none"` VHS parks the request until the first `play`, and a fetch
before then would load what the player was told not to load. A player that carries a source with no
handler for it yet — `player.src(...)` caches the source and hands it to the
tech a tick later — is left alone: its manifest request has not gone out, and
reading a second response of it would leave the core holding a second set of
media playlists that the player will never ask for.

A change of `currentSrc()` between manifests starts a new stream context; a
playlist or MPD refresh does not. The context ends as soon as the player
leaves the source, at whichever comes first of VHS taking the next source on
and the `loadstart` for it — not when the next manifest is read, which under
`preload="none"` is not until playback starts. A source VHS does not handle at
all, a progressive file or native HLS, ends it just the same: the core holds
no stream the player has left, so no peer announces or seeds one.

A player whose hooks are attached no longer runs the page's global VHS hooks:
VHS consults the global callback sets only for players that have none of their
own. An integrator who relies on `videojs.Vhs.xhr.onRequest` for a bound player
should move those hooks to that player.

VHS exposes no presentation-delay setting comparable to the other engines': it
starts a live stream at its own seekable end, honouring `EXT-X-START` and
`HOLD-BACK` where present. The adapter leaves that placement alone.

VHS is also the only engine here that caps the rendition by the size the player
is rendered at — `limitRenditionByPlayerDimensions`, on unless set to `false`.
A rendition is a swarm, so a Video.js viewer in a small window can end up in a
swarm no HLS.js, dash.js or Shaka viewer of the same stream is ever in. The
adapter does not touch the setting, which is the integrator's to make; a
deployment that mixes players and wants one swarm per rendition turns it off.

**On Safari and iOS there is nothing to intercept** unless the integrator opts
into `overrideNative`: VHS stands aside by default there — `overrideNative`
defaults to `!(IS_ANY_SAFARI || IS_IOS)` — so HLS plays natively through the
media element and no request passes through a VHS hook. Opting in requires MSE
and alters playback behaviour on exactly those platforms.

## Players the boundary is drawn to accommodate

No adapter for these lives in this repository. They are recorded because the
three responsibilities above were chosen so that adding them requires nothing
beyond those three — a boundary that only fits the players already behind it has
not been tested, and each of these exercises a different part of it.

### Native players

ExoPlayer and AVPlayer reach core through a local HTTP proxy rather than an
in-process adapter. That proxy is a separate project in its own repository;
what belongs here is the shape core must present to it, which is the same three
responsibilities. It is the case that motivates the playback contract carrying
no absolute position, since the proxy and the player are in different processes.
See [mobile-proxy.md](mobile-proxy.md).
