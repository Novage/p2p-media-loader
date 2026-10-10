# Release testing

What is tested before a release, in addition to the automated checks in
[`AGENTS.md`](../AGENTS.md). The tests are in two parts:

- **Part 1** lists the tests an AI assistant runs. It needs a shell, the demo,
  a Chromium browser it controls, and, on macOS, Safari through
  `safaridriver`.
- **Part 2** lists the tests a person runs. They need other devices, other
  networks, browsers the assistant cannot drive, or human eyes and ears.

A test moves from Part 2 to Part 1 as soon as the assistant can run it: an
assistant runs it the same way each time, and records every number.

The streams, the way to isolate a test swarm, and the checks on each stream
are in [verification.md](verification.md). This document refers to them and
does not repeat them.

## Findings

A test run finds problems. It does not fix them.

- **Do not fix the code or the documentation during a run.** This includes
  the source, the tests, the specs and the guides. Temporary edits are
  allowed: the demo edit of test 12, a one-off probe
  ([diagnostics.md](diagnostics.md)), a log line that an investigation needs.
  Each is removed when it is no longer needed, and is never committed. At the
  end of the run, `git status` and `git worktree list` show nothing that the
  run added.
- **Report the findings at the end of the run, for review.** For each finding,
  give the test, the stream and the engine, what was expected, what happened,
  the evidence (counters, logs, measurements), whether it occurred again in
  fresh tabs, and whether the last release has it too. Who reviews the report
  decides what is fixed and when.
- **Stop the run and report at once when a finding needs an immediate fix:**
  core functionality is broken, for example playback stops for good, a
  request is never served, P2P does not work at all, or the core loads the
  same segments again and again. Tests run after such a finding measure the
  defect, not the release. The run continues after the fix, from the test
  that found it.

## How the browser tests run

**Every browser test runs in at least two tabs.** Each tab is a peer. The tabs
use the same `swarmId`, and nobody else uses it
([verification.md](verification.md), "Isolating a test swarm"). One tab tests
playback only: it has no peer, so the core never elects an owner, never
shares, and never opens a peer connection. A result from one tab says nothing
about P2P. Use more than two tabs where a test says so.

**Start the demo** with `pnpm dev`. It serves on port 5173. The demo takes
`player`, `streamUrl`, `swarmId` and `trackers` as query parameters. The
player keys are in `packages/p2p-media-loader-demo/src/constants.ts`.

**Ask the person to show the browser before the tests start**, and to keep it
on screen while they run. In the Claude desktop app this is the built-in
browser pane, which is hidden unless the person opens it. A hidden page gives
false results: Chrome pauses its muted video, and a play after such a pause
can move the playhead to the live edge, which reads as a player that plays too
near the edge; a player that waits until it can be seen loads nothing; and the
timers run slower. Open the page with `preview_start` and its URL, which also
brings the pane up, and then confirm in the page itself:
`document.visibilityState` is `visible` and `innerWidth` is not 0. A pane the
person sees can still hold no page of this session, which then reports
`hidden` at 0×0; the browser tools' own "displayed" or "hidden" line says the
same. If the page is hidden, stop and ask again: a run in a hidden page is not
counted.

**Move the tabs together.** Most tests need two or more tabs to change stream
or player at the same moment. Open each tab with `driver=1` in the demo's
query: the dev server then loads a test driver (`demo/src/test-driver.ts`),
which the production build of the demo leaves out. Every driven tab listens on
one `BroadcastChannel`. Tab A sends code; every tab runs it and replies with
the result, and tab A collects one reply for each tab it expects. With this,
one script in tab A runs a test across any number of tabs.

The driver puts its helpers on `window.__h`:

| Helper                   | Does                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `all(code, count, ms?)`  | Runs `code` in this tab and in `count - 1` others, and returns every reply                                     |
| `others(code, count, …)` | Runs `code` in the other tabs only                                                                             |
| `go(params)`             | Changes the demo's query parameters without a reload; the demo destroys the player and core and makes new ones |
| `play()`                 | Plays with sound at a low volume                                                                               |
| `state()`                | `readyState`, media error, time, latency, and the diagnostics snapshot                                         |
| `delta(after, before)`   | Counter differences between two snapshots                                                                      |
| `sleep(ms)`, `video()`   | Waits; returns the page's video element                                                                        |

`go` is also the stream change that the lifecycle tests examine, and the
`driver` parameter stays in the query through it.

**Drive Safari through `safaridriver`.** It is Apple's WebDriver for Safari,
part of macOS, so the assistant can drive the real Safari over HTTP with no
other software. A person enables it once:

1. In Safari > Settings > Advanced, select "Show features for web developers".
2. In Safari > Settings > Developer, select "Allow remote automation".
3. In a terminal, run `safaridriver --enable` and give the administrator
   password.
4. Quit Safari (⌘Q). A Safari that was open before step 2 refuses the
   connection: each session request times out.

The assistant then starts `safaridriver -p 4444` in the background and uses
the W3C WebDriver endpoints: `POST /session` with
`{"capabilities": {"alwaysMatch": {"browserName": "safari"}}}`, then `/url`
to open a page, `/execute/sync` and `/execute/async` to run code in it, and
`DELETE /session/<id>` at the end. A small script in the scratch directory
does this with the standard library of any language.

- A session opens its own Safari window, with a clean state. Set
  `localStorage.debug` on `http://localhost:5173/` first, then open the test
  page.
- The console cannot be read through WebDriver. Read the ledger snapshot
  instead, and push what a probe records to an array on `window`.
- A session left open by a script that was stopped makes the next
  `POST /session` fail. Restart `safaridriver`.
- The test driver's `BroadcastChannel` does not reach another browser. Drive
  the Safari session and the Chrome tabs separately, and compare their
  snapshots.
- **A Safari session does not stand for Safari on the network.** In an
  automation session, Safari's WebRTC networking stops for about 10 seconds
  at a time: it answers no ICE check and sends no data, and then sends the
  delayed answers together. Chrome then reports the connection
  `disconnected` about every 15 seconds, and the core drops the peer. A
  normal Safari window with the same page and the same Chrome peer answered
  every check for minutes, and never went `disconnected`. So a Safari
  session tests playback, the player's use of MSE, and the registry, but not
  how long a peer connection holds, how much P2P Safari shares, or a stall
  of playback that comes with it. Those are tested by a person in a normal
  Safari window (Part 2, test 1). Use a `swarmId` of the test's own: a public
  stream's default swarm can hold other viewers, whose connections mix with
  the test's.
- To see whether a connection really goes silent, read Chrome's side:
  `getStats()` on the peer's `RTCPeerConnection` gives the selected
  candidate pair, its `requestsSent` and `responsesReceived`, and
  `lastPacketReceivedTimestamp`.

**Every tab with the driver follows every command.** A tab left over from an
earlier test silently joins the next one. Before each test, close every driven
tab that is not part of it, or reload it without `driver=1`.

**Run long tests in the page.** A browser tool call can time out before a test
of a minute or more ends. `window.__bg(name, task)` runs the test inside tab A
and keeps its log and result in `window.__R[name]`; read it in later calls.
When `all` expects more tabs than answer, it waits for its timeout, so a test
that names a wrong tab count is slow, not wrong.

**Keep the hidden tabs playing.** Even with the browser on screen, only its
front tab is visible, so the other test tabs are hidden. Chrome slows the
timers of a hidden tab and pauses video-only background media. Unmute the
video, set a low volume, and call `play()` in each tab. Allow for slower
timers: a step that takes 20 seconds in a visible tab can take 30 in a hidden
one, and a slow start is not a stall until the test has waited for it.
Measure live latency, startup placement, and anything that depends on the
player's own controls in the front tab only, and bring each tab to the front
in turn where a test measures more than one.

**What to observe:**

- The media element: `readyState`, `error`, `currentTime`, `buffered`,
  `seekable`, `paused`.
- The demo page: HTTP and P2P totals, and the peer graph.
- The debug loggers, through `localStorage.debug`. Set it before the page
  loads: the `debug` library reads it at load.

  | Logger                       | Shows                                                                         |
  | ---------------------------- | ----------------------------------------------------------------------------- |
  | `p2pml-core:registry-miss`   | A player request that the registry does not know                              |
  | `p2pml-core:manifest`        | The registry each manifest gives                                              |
  | `p2pml-core:clock`           | Clock synchronization and re-parses of clock-based lists                      |
  | `p2pml-core:hybrid-loader-*` | Requests and their urgency, and each prefetch "as owner" or "as backup #n"    |
  | `p2pml-core:tracker`         | Announces, offers, answers, peers held and released                           |
  | `p2pml:diagnostics`          | Enables the ledger ([diagnostics.md](diagnostics.md)), and logs its anomalies |
  | `p2pml:diagnostics:log`      | Each open and close of a ledger record                                        |

  The browser keeps only the most recent console lines. Enable only the
  loggers that a test reads, or the lines it needs are lost: one busy page
  with every open and close logged pushes out tens of thousands of lines.

- The ledger snapshot, described below.

**Count resources.** A leak shows as a resource that stays open after the
stream, player or core that owned it is gone. Enable the diagnostics ledger
([diagnostics.md](diagnostics.md)) in each tab, and take a snapshot of
`globalThis.__p2pmlDiagnostics` before and after each step. The ledger also
counts downloads by source and result, registry misses and closed peers by
cause, and timers that fire after their owner was destroyed. Some resources are released late by design; the list is in
[diagnostics.md](diagnostics.md), "What is recorded". An investigation that
needs more detail adds one-off probes under the rules in
[diagnostics.md](diagnostics.md), and removes them when it ends. The ledger
sees only what the library holds: an object that a player or the demo leaves
running shows only as console errors or a growing heap.

**Summarize each tab the same way.** For each tab and step, record:
`readyState`, media error, latency behind the end of the seekable range, the
peers held, the HTTP and P2P downloads and failures of the step (counter
differences), registry misses, peer closes by cause, records still open from
before the step, and anomalies. Also record the swarm of each open P2P loader
(the detail of its `P2PLoader` record). "No P2P" between two tabs means
nothing until their swarms are compared: two tabs that chose different
renditions are in different swarms, which is correct, and are not a defect.

**Avoid false results:**

- Do not edit the source while a test runs. Vite reloads the changed modules
  in the open pages, and the test then measures a mix of old and new code. The
  temporary demo edit of test 12 is made between tests, and is followed by a
  check that the driver and the ledger are still there.
- Reload the tabs between test groups. Tabs that ran many tests can carry
  state from earlier tests.
- Pin the rendition when a test measures sharing between two engines
  ([verification.md](verification.md), "Cross-player sharing"). Where a
  player has no selector, compare the swarms of the open P2P loaders instead.
- Confirm that each injected fault happened: count it where it is injected,
  and treat a test whose fault count is zero as not run.
- A defect is real only when it occurs again in fresh tabs. For a connection
  defect, keep the `p2pml-core:tracker` log of the failure.
- `livesim2` allows 10000 requests per IP address per day. Long live runs can
  reach the limit; its `/reqcount` shows the count. Use an HLS live stream for
  the long run.
- In shell checks, quote and split lists explicitly. `zsh` does not split an
  unquoted variable into words, so a loop over a list in one variable runs
  once, on the whole list.
- Keep the scratch work out of the repository: tarballs packed with
  `--pack-destination`, a worktree of an older release, and a consumer
  project all go in a scratch directory, and are removed at the end.

**Plan for about five hours.** The long run takes an hour and runs in its own
tabs, beside the other tests. Its tabs must not have the driver. The Safari
runs add about an hour.

## Part 1: tests for the AI assistant

Each test lists what to do and what must be true. "No leak" means: after each
step, nothing that the previous step opened is still open.

**Run in Safari too.** Tests 2, 3, 4, 5, 13 and 14 run again in a Safari
session, with a Chrome tab as the second peer of the swarm. The pass rules on
playback, MSE use and the registry are the same. The rules on P2P are not
judged in the Safari session: see "Drive Safari through `safaridriver`"
above.

### 1. Automated checks

Run `pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm knip`, `pnpm jscpd`,
`pnpm build`, typedoc, and `pnpm pack-packages`. Run
`npx prettier --check "specs/**/*.md" AGENTS.md`.

Pass: no errors, no knip findings, jscpd within its budget, typedoc with no
warnings, and each package tarball holds the files its `package.json`
exports.

A tarball packed here has no `README.md`, and that is expected, not a finding.
Each package's README is a symlink to the root one, which `pnpm pack` skips;
the publish workflow (`.github/workflows/npm-publish.yml`, "Override
symlinks") copies the root README into each package before it publishes.

### 2. Stream matrix

Play every stream in the matrix in [verification.md](verification.md) on every
engine that supports its protocol, in two tabs in one swarm. Let each step
play for at least 15 seconds.

Pass:

- `readyState` 4 and no media error in both tabs.
- No registry miss, except for the WebM renditions that
  [verification.md](verification.md) lists as playing without P2P.
- The buffer that each request is judged by agrees with the media element's,
  and the requests are urgent as [verification.md](verification.md),
  "Playback contract", describes.
- Both tabs hold a peer. In steady state, both tabs get segments over P2P,
  and the two tabs together fetch each segment over HTTP about once. Record
  each player's latency with the result: a player that plays near the live
  edge on short segments gets little or no P2P.
- No leak, no anomaly, and no error in the console.
- Record the dropped frames (`video.getVideoPlaybackQuality()`). A share
  above 1% of the frames is a finding to examine.

### 3. Pause

For every engine, on live, DVR and VOD streams: let both tabs play for 20
seconds, pause tab A for 40 seconds while tab B plays, then play A for 15
seconds more. On DVR, seek tab A to the middle of the window before the pause:
a viewer the pause carries to within the adapters' margin of the window's
start is brought back to the live delay by design (see
[playback-contract.md](playback-contract.md), "The urgency threshold").

Pass:

- Live: after the resume, HLS.js and dash.js are back at their live delay;
  Shaka and Video.js keep the playhead inside the window. No stall.
- DVR: a viewer who rewound into the window stays where they chose.
- Live storage stays bounded during the pause. VOD storage grows and stops at
  the storage limit.
- P2P continues in both directions after the resume. No leak.

### 4. Seeks on VOD

A player with P2P must not seek or start slower than the same player without
it, on the same player parameters
([playback-contract.md](playback-contract.md), "Urgency"). For every engine and
every VOD stream:

1. **With P2P.** Load the stream in both tabs, in a new swarm, and let them
   play for 10 seconds, so that tab B holds segments. Pause tab B: it still
   gives segments over P2P, and its player's downloads stop sharing the link
   with tab A. Then seek tab A 12 times, with waits of 1.5 to 4 seconds, by a
   fixed plan in fractions of the stream's length that covers the seek cases
   of [playback-contract.md](playback-contract.md), "Behaviour under seeking":
   forward and back into unbuffered media, back inside the buffer, into an
   earlier buffered island, to just before an island, and near the end. For
   example: 0.30, 0.27, 0.32, 0.10, 0.30, 0.60, 0.57, 0.12, 0.90, 0.40, 0.95,
   0.45.
2. **Without P2P.** After step 1, not beside it, load the stream in tab A alone
   with P2P disabled, through the temporary demo edit of test 12; undo the
   edit when the test ends, as test 12 says. The adapters write the same player
   settings whether P2P is on or not, so the player's parameters are the same.
   Run the same plan with the same waits, at positions moved by 2% of the
   stream's length: the same positions would come from the browser's HTTP
   cache.
3. **With tab B closed**, where tab A was slower in step 1. Move tab B to
   another swarm, and run step 1 again in tab A, at positions moved by 4%. Tab
   A then has no peer, and what is left is the core's own cost. On one machine
   a paused peer still prefetches what it owns, and its downloads share the
   machine's link with tab A; the comparison with a peer present is made on two
   machines, in Part 2.

Record the time from the change of source to `readyState` 3 (load), the time
from each seek to `readyState` 3 with `seeking` false, whether the target was
buffered, and the first request after each seek with its urgency
(`p2pml-core:hybrid-loader-*`).

One measurement is noisy: the network's own variation is as large as the limit.
Where a comparison fails, repeat it before judging. Repeat a load 3 times in
each mode, in turns. Repeat a seek that took more than 1 second longer 3 times
in each mode, with seeks of the same kind, and with tab B closed. Judge by the
medians of the repeats.

Pass:

- Each seek reaches `readyState` 3 or more within 15 seconds. Most take less
  than 5 seconds.
- The core's own cost is at most 0.3 seconds: tab A's time to `readyState` 3 at
  load and its median seek time, in step 1, or in step 3 where step 1 was
  slower, are at most 0.3 seconds longer than in step 2, after the repeats.
- After each seek into unbuffered media, the first request at the new place is
  urgent and starts at once, or the store serves it, and no urgent download
  starts at the position the player left ([verification.md](verification.md),
  "Playback contract").
- In step 1, tab A gets segments from tab B over P2P. Where the two tabs did
  not connect, run step 1 again in a new swarm.
- No leak, no anomaly.

### 5. Playback rate on VOD

Viewers often watch VOD at a higher speed, so this is tested as a feature. For
every engine and every VOD stream, in two tabs:

- tab A at `playbackRate` 2 and tab B at 1, for 60 seconds;
- both tabs at 2, for 60 seconds;
- tab A at 1.5, then 0.5, then back to 1, 20 seconds each;
- a seek in tab A while it plays at 2.

Set the rate on the media element, or through the player's own speed control
where it has one: a player can set its own rate back when its source changes.

Pass:

- `currentTime` advances at the rate, within 10%, with no `waiting` event
  after the start, and the buffer ahead of the playhead never empties.
- The core's time windows scale with the rate
  ([playback-contract.md](playback-contract.md), "The time windows"): at 2,
  the prefetch reaches about twice as far ahead in media time.
- Both tabs at 2: both get segments over P2P, and the two tabs together fetch
  each segment over HTTP about once. Tab A at 2 and B at 1: A gets segments
  over P2P where B is ahead of it, and the HTTP downloads stay within what A
  alone needs.
- Dropped frames are recorded as in test 2. No leak, no anomaly.

### 6. Quality switches

On a stream with several renditions, use the demo's quality selector to
switch:

- in both tabs at the same moment;
- in one tab only;
- back to the first rendition;
- and let the engine switch by itself (Auto).

Pass:

- Tabs on the same rendition hold a peer again within 10 seconds of the
  switch.
- Tabs on different renditions hold no peer. This is correct: each rendition
  is a swarm.
- The P2P loader of the old rendition closes. No leak.

### 7. Simultaneous joins

Move both tabs into a new swarm at the same moment, 16 times, and alternate
engines.

Pass: after each join, both tabs hold a peer within 15 seconds. The tracker
log shows each glare settled: one peer takes the answer to its own offer, the
other refuses that answer ([webtorrent-manager spec](../packages/p2p-media-loader-core/src/webtorrent/webtorrent-manager/spec.md),
"Glare").

### 8. Three to five peers

With three to five tabs on one live stream and one VOD stream:

- open one more tab two minutes after the others;
- close a tab while it uploads a segment;
- close a tab and open it again.

Pass: the late tab gets segments over P2P; the other tabs continue without a
stall when a tab closes, and a backup fetches what the closed owner did not
deliver; the tabs together fetch each segment over HTTP about once
([prefetch.md](prefetch.md)). No leak.

### 9. Player and source lifecycle

- Change stream or player 20 times, less than 2 seconds apart.
- Change stream while segment requests are open.
- Put two players on one page, and destroy one of them. The demo shows one
  player; start the second from the console, with a dynamic `import()` of the
  adapter at the path the dev server serves it from
  (`/@fs/<repository>/packages/p2p-media-loader-hlsjs/src/index.ts`) and of
  the player from its pre-bundled dependency (`/node_modules/.vite/deps/`).
  Each core has its own tracker sockets.

Pass: no error after a destroy, no event from a destroyed core, no leak, and
the last stream plays and shares. With two players, each has its own records,
and destroying one leaves the other's records and playback as they were.

### 10. Network faults

Wrap `window.fetch`, `XMLHttpRequest` and `window.WebSocket` in the page
before the players start (the driver changes players without a reload, so a
wrapper installed first applies to them). The core fetches segments with
`fetch`; the players fetch manifests their own way — HLS.js, dash.js and
Video.js with `XMLHttpRequest`, Shaka through its networking engine — so a
manifest fault must be placed where that player's request goes. A wrapper must
honour the request's abort signal, or a request that never answers cannot be
cancelled. Use the wrappers to:

- answer some segment requests with 404, 503, or no answer (timeout);
- answer a manifest request with an error;
- delay every response, as on a slow network;
- close the tracker sockets, and refuse new ones for 30 seconds;
- set the `trackers` query parameter to a tracker that does not exist;
- remove `RTCPeerConnection` from the page before the players start, as a
  browser with WebRTC disabled does.

Pass: failed requests are tried again; a segment that fails over HTTP comes
over P2P where a peer has it; playback continues or recovers when the fault
stops; tracker sockets reconnect with a growing delay, and peer connections
already open stay open; an unreachable tracker gives HTTP-only playback, and
its reconnect delay grows rather than looping. Without WebRTC, the stream
plays over HTTP only, with no error loop and no leak. The browser logs each
failed `WebSocket` itself; that is not an error loop.

### 11. Live edge cases

The streams are in [verification.md](verification.md), "Streams for special
cases".

- **Wrong device clock.** Before the players start, shift the whole page
  clock 30 seconds fast, then 30 seconds slow: replace `Date` itself — `new
Date()` as well as `Date.now` — and restore it afterwards. A player that
  reads both sees two clocks when only `Date.now` moves. Play a `livesim2`
  `SegmentTemplate` stream.
- **A live stream that ends.** Use `livesim2` with an absolute stop time,
  `/livesim2/stop_<epoch seconds>/testpic_2s/Manifest.mpd`, about a minute
  ahead. Its MPD becomes static at that time. Measure the longest pause of the
  page's main thread with a 100 ms heartbeat timer.
- **Several periods.** Use `livesim2` with `periods_60`.
- **Low latency.** Use a low-latency DASH stream (`livesim2` with
  `chunkdur_1/ato_7`) and a low-latency HLS stream. Check first that the HLS
  media playlist has `EXT-X-PART` tags: a stream listed as low latency does
  not always have them.

Pass: with a wrong clock, the ledger shows a clock synchronization, there is
no registry miss, and no owner request fails with 404 or 425; a stream that
ends plays to its end, the page does not stop for longer than a second, and
the core stops its re-parses and its downloads after the end; each period
plays and shares; HLS.js and Video.js play a low-latency HLS stream by its
full segments, since their adapters turn low latency off, so the page requests
no partial segment and has no registry miss; a part that a player requests
anyway is not registered, goes over HTTP, and does not stop playback
([architecture.md](architecture.md)). A player can take 30
seconds or more to start a low-latency stream in a hidden tab.

### 12. Configuration

- The IndexedDB storage example (`hlsjs_indexeddb_hls`).
- A `swarmId` in each tab, and two tabs with different `swarmId` values: these
  must not meet.
- P2P disabled, upload disabled, and an `httpRequestSetup` hook, set in a
  temporary local edit of the demo. Read each from a query parameter, so that
  one edit serves all three, and undo the edit at the end. Undo it by hand, or
  with `git restore` only where the file has no other uncommitted change:
  `git restore` discards those too. Do not commit it.

Pass: each setting has its documented effect, and playback is not affected.
P2P disabled: no tracker socket and no P2P loader. Upload disabled in one tab:
that tab still downloads over P2P, and the other tab gets nothing from it.
The hook: it is called for each HTTP download.

### 13. Player wrappers

Play a live HLS stream and a live DASH stream in every player of the demo:
Video.js 10, DPlayer, Clappr, OpenPlayerJS and MediaElement,
first with the same wrapper in both tabs, then with the raw engine in the
second tab on the same rendition. Clappr does not autoplay: click its play
button. Run it in Chrome and in Safari. Both report native HLS
(`video.canPlayType("application/vnd.apple.mpegurl")`), and a wrapper that
prefers native HLS when it is offered bypasses the engine, and with it P2P
([player-adapters.md](player-adapters.md), "Hosted in a player built on
HLS.js").

Pass: each wrapper plays through MSE — the visible video's source is a `blob:`
URL, and requests reach the core (`PlayerRequest` counts) — records its
latency, and shares segments with the other tab. A hidden element with the
manifest URL beside it, as MediaElement keeps, is not native playback while
it makes no requests.

### 14. Special streams

- An audio-only live stream.
- A stream with several audio tracks, and a stream with subtitles.
- An HLS stream with AES-128 encryption.

Pass: each plays and shares, with no registry miss for a subtitle fragment.
On the encrypted stream, the key requests do not go through the core — the
page's resource timing shows the key fetched by the player and only the
segments by the core's `fetch` — and the tab that receives a segment over P2P
plays it, which shows that ciphertext was shared ([encryption.md](encryption.md)).

### 15. Mixed versions

Run the demo of the last release (a worktree at its tag, with its own
install, on another port) and the demo of this release, in one swarm. Compare
the two `PEER_PROTOCOL_VERSION` values first. Where they differ, add a control:
two tabs of the older release in the same swarm, which must meet. Without it,
"never meet" cannot be told apart from a tracker problem.

Pass: peers with the same `PEER_PROTOCOL_VERSION` meet and share segments.
Peers with different versions never meet, and neither shows an error
([segment-identity.md](segment-identity.md)).

### 16. Long run

Play the long-run stream in [verification.md](verification.md) in two tabs of
their own for 60 minutes, beside the other tests. Each tab samples itself
every 5 minutes with a timer of its own, and takes no driver commands.

Pass: after the first minutes, the JS heap (`performance.memory`), the stored
segment count, and the count of open resources stay flat; the live latency
stays at its delay; the count of clock re-parses grows at one for each segment
duration; the tracker socket count stays the same.

### 17. Consumer install and documentation

Install the packed tarballs in a new Vite project and a new webpack project,
in a scratch directory, with the player versions the demo uses. Write a small
integration for each player package that uses only the public API, as the
demo's player components show it. Build it, type-check it with library
checking on, and play a stream with it in two tabs, with the diagnostics
ledger enabled.

Write the integrations by following `README.md`, `MIGRATION.md` and
`api_documentation.md` as an integrator would, not from the repository's code.
Test 18 then checks the documents themselves, with these projects.

Pass: the projects build and type-check with no error; both tabs play and
share with each player; the ledger works in the packed build and records no
anomaly. Each step the documents leave out is a finding.

### 18. Documentation

An assistant reads the documents as an integrator would, and checks each claim
they make against the code and each example against a compiler. Run it after
test 17, in the same consumer projects.

- **Every public item has a description.** In each package directory run
  `npx typedoc --validation.notDocumented true --emit none`. The root
  `typedoc.json` builds the packages together, and in that mode the check
  reports nothing, so run it per package. Then read the built pages of each
  public class and option: a description that says less than the code does,
  or something else, is a finding.
- **Every TypeScript example compiles as written.** Copy each `typescript`
  and `tsx` example of `README.md`, `MIGRATION.md`, `api_documentation.md`,
  `FAQ.md` and the `@example` blocks of the public classes into the Vite
  project, one file each. Declare only what an example takes for granted: the
  page values every example uses, `videoElement` and `streamUrl`, and what its
  text or comments name as given, such as the response a loader received or a
  server's own list of streams. Type-check with
  `strict` and `skipLibCheck: false`. An example that needs any other change
  to compile is a finding. So is one that compiles only against a different
  build of a player than the one it imports, as Shaka's UI build against the
  engine's types did.
- **Every HTML and CDN example would run.** Each variable it uses is defined
  in it, or the text says it is assumed. The page's import map has an entry
  for every bare specifier the engine's `dist/*.es.js` imports — read them
  from the bundle. Each CDN URL answers 200, and each pinned version is the
  version the demo uses. The URLs of this project's own packages resolve only
  once the release is on npm — a range such as `^5` matches no pre-release —
  so check those right after publishing.
- **Every player example matches the demo.** The demo's component for the
  same player is the tested integration. A setting the demo needs and the
  example lacks — MediaElement's `renderers`, the mixin on `window.Hls` for a
  player that creates HLS.js from it — is a finding, and so is a helper the
  example calls that only the demo defines.
- **Every stated fact is true.** Defaults, logger namespaces, supported
  versions, bundle sizes, and how to turn diagnostics on: check each against
  the code, or measure it.

Pass: no findings. List each one with the document, the section and the fix.

### 19. Player versions

The release is tested with the players the demo loads, so those must be the
ones integrators get today. List every player and plugin the demo uses: the
dependencies in `packages/p2p-media-loader-demo/package.json` and
`demo/package.json`, and every script URL in the demo's source, such as
Clappr's. For each:

- **The newest release.** The version the lockfile installs, or that a CDN
  range resolves to, is npm's `latest` (`npm view <package> dist-tags`). A
  newer version on another tag, such as `next-8`, does not count. An older
  major is a finding unless the demo says why where it loads it, as for
  Clappr's Shaka 4, which its DASH plugin requires.
- **Not deprecated.** `npm view <package>@<version> deprecated` is empty.
- **From its current home.** The source repository is not archived (GitHub
  API, `archived`). A package that moved is loaded from where it moved to,
  as Clappr's plugins moved into the Clappr monorepo.
- **Pinned copies.** A player that pins its own engine (Video.js 10.0.1 pins
  `hls.js` 1.6.7 and `dashjs` 5.2.0) is recorded with that version: the demo
  cannot change it, and the adapter must work with it.
- **Still maintained.** Record each package's last release. One with no
  release for two years or more (DPlayer: January 2023) is reported as a
  watch item, with the state of its repository.

Pass: no findings. List the watch items and the pinned copies with the result.

## Part 2: tests for a person

These need what the assistant does not have, or a judgement it cannot make.

1. **Other browsers.** Safari on macOS, iOS and iPadOS, Chrome on Android,
   Firefox, and Edge. Run the stream matrix, the pause test and the playback
   rate test in each. Include Safari's native HLS where a player uses it. On
   macOS, play in a normal Safari window beside a Chrome tab of the
   assistant's in one swarm of the test's own, for at least three minutes:
   the peer connection must hold, and both must get segments over P2P from
   each other. The assistant reads Chrome's side. Part 1 covers desktop
   Safari's playback only. Firefox moves to Part 1 once a run through
   `geckodriver` has been done.
2. **Real networks.** Two devices on different networks, for example home
   Wi-Fi and mobile data, so that connections go through STUN and NAT. Also a
   network that blocks WebRTC, such as a strict corporate firewall: playback
   must continue over HTTP only. Run test 4 of Part 1 there with the peer on
   the other device, so that its downloads do not share the measured link:
   with a peer present, a seek and a start must be no slower than without P2P.
3. **Mobile use.** Lock the screen, send the browser to the background, and
   move between Wi-Fi and mobile data while a stream plays. Playback and P2P
   must recover.
4. **Low-end devices.** An old Android phone and a smart TV browser: CPU load,
   memory, and battery use during a long stream.
5. **Picture and sound.** Watch and listen at segment boundaries, after seeks,
   after quality switches, and at 2× speed, with P2P on. Look for glitches and
   loss of audio and video synchronization. Part 1 counts stalls and dropped
   frames; what they look and sound like needs a person.
6. **DRM.** Widevine, PlayReady and FairPlay streams with their license
   servers.
7. **Real audience.** Ten or more viewers on different devices, on the public
   trackers or a production tracker. Check the P2P share and the tracker load.
8. **Production streams.** Customer-like streams: token-signed URLs, CDN
   access rules, and CORS settings.
9. **Privacy settings.** Brave, private windows, and Firefox with strict
   privacy settings. Playback must continue over HTTP only.
10. **Mobile proxy.** Native players through the local proxy
    ([mobile-proxy.md](mobile-proxy.md)) on a real Android and iOS app.
11. **Release pipeline.** A dry run of the publish workflow, which needs the
    registry credentials.
