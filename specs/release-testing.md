# Release testing

What is tested before a release, in addition to the automated checks in
[`AGENTS.md`](../AGENTS.md). The tests are in two parts:

- **Part 1** lists the tests an AI assistant runs. It needs only a shell, the
  demo, and a Chromium browser it controls.
- **Part 2** lists the tests a person runs. They need other browsers, other
  devices, other networks, or human eyes and ears.

The streams, the way to isolate a test swarm, and the checks on each stream
are in [verification.md](verification.md). This document refers to them and
does not repeat them.

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

**Every tab with the driver follows every command.** A tab left over from an
earlier test silently joins the next one. Before each test, close every driven
tab that is not part of it, or reload it without `driver=1`.

**Run long tests in the page.** A browser tool call can time out before a test
of a minute or more ends. `window.__bg(name, task)` runs the test inside tab A
and keeps its log and result in `window.__R[name]`; read it in later calls.
When `all` expects more tabs than answer, it waits for its timeout, so a test
that names a wrong tab count is slow, not wrong.

**Keep the hidden tab playing.** Only one tab is visible, and it can be one that
is not in the test, so all the test tabs can be hidden. Chrome slows the timers
of a hidden tab and pauses video-only background media. Unmute the video, set a
low volume, and call `play()` in each tab. Allow for slower timers: a step that
takes 20 seconds in a visible tab can take 30 in a hidden one, and a slow start
is not a stall until the test has waited for it.

**What to observe:**

- The media element: `readyState`, `error`, `currentTime`, `buffered`,
  `seekable`, `paused`.
- The demo page: HTTP and P2P totals, and the peer graph.
- The debug loggers, through `localStorage.debug`. Set it before the page
  loads: the `debug` library reads it at load.

  | Logger                       | Shows                                                                         |
  | ---------------------------- | ----------------------------------------------------------------------------- |
  | `p2pml-core:registry-miss`   | A player request that the registry does not know                              |
  | `p2pml:playback-oracle`      | The core's playhead beside the media element's                                |
  | `p2pml-core:manifest`        | The registry each manifest gives                                              |
  | `p2pml-core:clock`           | Clock synchronization and re-parses of clock-based lists                      |
  | `p2pml-core:hybrid-loader-*` | Requests, and each prefetch "as owner" or "as backup #n"                      |
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
  temporary demo edit of test 11 is made between tests, and is followed by a
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

**Plan for about four hours.** The long run takes an hour and runs in its own
tabs, beside the other tests. Its tabs must not have the driver.

## Part 1: tests for the AI assistant

Each test lists what to do and what must be true. "No leak" means: after each
step, nothing that the previous step opened is still open.

### 1. Automated checks

Run `pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm knip`, `pnpm jscpd`,
`pnpm build`, typedoc, and `pnpm pack-packages`. Run
`npx prettier --check "specs/**/*.md" AGENTS.md`.

Pass: no errors, no knip findings, jscpd within its budget, typedoc with no
warnings, and each package tarball holds the files its `package.json`
exports.

### 2. Stream matrix

Play every stream in the matrix in [verification.md](verification.md) on every
engine that supports its protocol, in two tabs in one swarm. Let each step
play for at least 15 seconds.

Pass:

- `readyState` 4 and no media error in both tabs.
- No registry miss, except for the WebM renditions that
  [verification.md](verification.md) lists as playing without P2P.
- The playback oracle (`p2pml:playback-oracle`) agrees with the media
  element, as [verification.md](verification.md) describes.
- Both tabs hold a peer. In steady state, both tabs get segments over P2P,
  and the two tabs together fetch each segment over HTTP about once. A player
  that the adapter does not place on live — Video.js 8 is one
  ([player-adapters.md](player-adapters.md)) — can play so near the live edge
  on short segments that it gets no P2P; record its latency with the result.
- No leak, no anomaly, and no error in the console.

### 3. Pause

For every engine, on live, DVR and VOD streams: let both tabs play for 20
seconds, pause tab A for 40 seconds while tab B plays, then play A for 15
seconds more.

Pass:

- Live: after the resume, HLS.js and dash.js are back at their live delay;
  Shaka and Video.js keep the playhead inside the window. No stall.
- DVR: a viewer who rewound into the window stays where they chose.
- Live storage stays bounded during the pause. VOD storage grows and stops at
  the storage limit.
- P2P continues in both directions after the resume. No leak.

### 4. Random seeks on VOD

For every engine and every VOD stream: let both tabs play for 10 seconds.
Then seek tab A 12 times to random positions, forward and back, while tab B
plays. Wait 1.5 to 4 seconds between seeks. Include the four seek cases in
[playback-contract.md](playback-contract.md).

Pass:

- Each seek reaches `readyState` 3 or more within 15 seconds. Most take less
  than 5 seconds.
- The playback oracle agrees after each seek.
- Tab A gets segments from tab B over P2P at positions that B prefetched.
- No leak.

### 5. Quality switches

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

### 6. Simultaneous joins

Move both tabs into a new swarm at the same moment, 16 times, and alternate
engines.

Pass: after each join, both tabs hold a peer within 15 seconds. The tracker
log shows each glare settled: one peer takes the answer to its own offer, the
other refuses that answer ([webtorrent-manager spec](../packages/p2p-media-loader-core/src/webtorrent/webtorrent-manager/spec.md),
"Glare").

### 7. Three to five peers

With three to five tabs on one live stream and one VOD stream:

- open one more tab two minutes after the others;
- close a tab while it uploads a segment;
- close a tab and open it again.

Pass: the late tab gets segments over P2P; the other tabs continue without a
stall when a tab closes, and a backup fetches what the closed owner did not
deliver; the tabs together fetch each segment over HTTP about once
([prefetch.md](prefetch.md)). No leak.

### 8. Player and source lifecycle

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

### 9. Network faults

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
- set the `trackers` query parameter to a tracker that does not exist.

Pass: failed requests are tried again; a segment that fails over HTTP comes
over P2P where a peer has it; playback continues or recovers when the fault
stops; tracker sockets reconnect with a growing delay, and peer connections
already open stay open; an unreachable tracker gives HTTP-only playback, and
its reconnect delay grows rather than looping. The browser logs each failed
`WebSocket` itself; that is not an error loop.

### 10. Live edge cases

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
plays and shares; low-latency parts are not registered, go over HTTP, and do
not stop playback ([architecture.md](architecture.md)). A player can take 30
seconds or more to start a low-latency stream in a hidden tab.

### 11. Configuration

- The IndexedDB storage example (`vidstack_indexeddb_hls`).
- A `swarmId` in each tab, and two tabs with different `swarmId` values: these
  must not meet.
- P2P disabled, upload disabled, and an `httpRequestSetup` hook, set in a
  temporary local edit of the demo. Read each from a query parameter, so that
  one edit serves all three, and undo the edit with `git restore` at the end.
  Do not commit it.

Pass: each setting has its documented effect, and playback is not affected.
P2P disabled: no tracker socket and no P2P loader. Upload disabled in one tab:
that tab still downloads over P2P, and the other tab gets nothing from it.
The hook: it is called for each HTTP download.

### 12. Player wrappers

Play a live HLS stream and a live DASH stream in every player of the demo:
Video.js 10, Vidstack, Plyr, DPlayer, Clappr, OpenPlayerJS and MediaElement,
first with the same wrapper in both tabs, then with the raw engine in the
second tab on the same rendition. Clappr does not autoplay: click its play
button. Check what the browser reports for native HLS
(`video.canPlayType("application/vnd.apple.mpegurl")`): a wrapper that prefers
native HLS when it is offered bypasses the engine, and with it P2P.

Pass: each wrapper plays, records its latency, and shares segments with the
other tab.

### 13. Special streams

- An audio-only live stream.
- A stream with several audio tracks, and a stream with subtitles.
- An HLS stream with AES-128 encryption.

Pass: each plays and shares, with no registry miss for a subtitle fragment.
On the encrypted stream, the key requests do not go through the core — the
page's resource timing shows the key fetched by the player and only the
segments by the core's `fetch` — and the tab that receives a segment over P2P
plays it, which shows that ciphertext was shared ([encryption.md](encryption.md)).

### 14. Mixed versions

Run the demo of the last release (a worktree at its tag, with its own
install, on another port) and the demo of this release, in one swarm. Compare
the two `PEER_PROTOCOL_VERSION` values first. Where they differ, add a control:
two tabs of the older release in the same swarm, which must meet. Without it,
"never meet" cannot be told apart from a tracker problem.

Pass: peers with the same `PEER_PROTOCOL_VERSION` meet and share segments.
Peers with different versions never meet, and neither shows an error
([segment-identity.md](segment-identity.md)).

### 15. Long run

Play the long-run stream in [verification.md](verification.md) in two tabs of
their own for 60 minutes, beside the other tests. Each tab samples itself
every 5 minutes with a timer of its own, and takes no driver commands.

Pass: after the first minutes, the JS heap (`performance.memory`), the stored
segment count, and the count of open resources stay flat; the live latency
stays at its delay; the count of clock re-parses grows at one for each segment
duration; the tracker socket count stays the same.

### 16. Consumer install

Install the packed tarballs in a new Vite project and a new webpack project,
in a scratch directory, with the player versions the demo uses. Write a small
integration for each player package that uses only the public API, as the
demo's player components show it. Build it, type-check it with library
checking on, and play a stream with it in two tabs, with the diagnostics
ledger enabled.

Pass: the projects build and type-check with no error; both tabs play and
share with each player; the ledger works in the packed build and records no
anomaly.

## Part 2: tests for a person

These need what the assistant does not have, or a judgement it cannot make.

1. **Other browsers.** Firefox, Safari on macOS, Safari on iOS and iPadOS,
   Chrome on Android, and Edge. Run the stream matrix and the pause test in
   each. Include Safari's native HLS where a player uses it.
2. **Real networks.** Two devices on different networks, for example home
   Wi-Fi and mobile data, so that connections go through STUN and NAT. Also a
   network that blocks WebRTC, such as a strict corporate firewall: playback
   must continue over HTTP only.
3. **Mobile use.** Lock the screen, send the browser to the background, and
   move between Wi-Fi and mobile data while a stream plays. Playback and P2P
   must recover.
4. **Low-end devices.** An old Android phone and a smart TV browser: CPU load,
   memory, and battery use during a long stream.
5. **Picture and sound.** Watch and listen at segment boundaries, after seeks,
   and after quality switches, with P2P on. Look for frozen frames, glitches,
   and loss of audio and video synchronization.
6. **DRM.** Widevine, PlayReady and FairPlay streams with their license
   servers.
7. **Real audience.** Ten or more viewers on different devices, on the public
   trackers or a production tracker. Check the P2P share and the tracker load.
8. **Production streams.** Customer-like streams: token-signed URLs, CDN
   access rules, and CORS settings.
9. **Privacy settings.** Brave, private windows, Firefox with strict privacy
   settings, and WebRTC disabled. Playback must continue over HTTP only.
10. **Mobile proxy.** Native players through the local proxy
    ([mobile-proxy.md](mobile-proxy.md)) on a real Android and iOS app.
11. **Documentation.** Follow `README.md` and `MIGRATION.md` with a real
    integration, and read the API documentation for gaps.
12. **Release pipeline.** A dry run of the publish workflow, which needs the
    registry credentials.
