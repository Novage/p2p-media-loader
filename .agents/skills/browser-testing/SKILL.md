---
name: browser-testing
description: Use for any test of P2P Media Loader in a browser — the release tests of specs/release-testing.md, a short live check after a change, a fault injected into a page, a measurement of P2P share, or a page tried in an old browser. Covers the demo servers, the multi-tab test driver, the saved scripts in demo/release-tests/ (load and reuse them, fix them when out of date, save every new or changed one), what to observe, and how to avoid false results.
---

# Browser testing

How to test P2P Media Loader in a browser. What a release test checks, and its
pass condition, are in
[specs/release-testing.md](../../../specs/release-testing.md); the streams are
in [specs/verification.md](../../../specs/verification.md). Where this skill
and a spec disagree, the spec is right.

Two more files in this folder:

- [safari.md](safari.md): driving Safari through `safaridriver`.
- [investigations.md](investigations.md): short checks and investigations
  outside a release run — a two-peer measurement, a player's internals, a
  control without P2P, old browsers and the IIFE pages.

## A test is not a fix

During a test, fix nothing in the source, the unit tests, the specs or the
guides; record the findings and report them at the end
([release-testing.md](../../../specs/release-testing.md), "Findings"). The
scripts in `demo/release-tests/` are the exception. Temporary edits — a probe,
a log line, a control page — are allowed, and are removed when the test ends.
At the end, `git status` and `git worktree list` show nothing the test added.

## The servers

- **The dev server**, `pnpm dev` in `demo/`, or `preview_start` with the
  `demo` entry of `.claude/launch.json`, serves on port 5173. It serves the
  packages' `src/` directly, so a change needs no build. A server the person
  already runs makes `preview_start` fail: navigate to `localhost:5173`
  instead.
- **`vite preview`** serves `demo/dist` on port 4173: a snapshot of the last
  `pnpm build`. After a change, build again and restart it.
- The demo takes `player`, `streamUrl`, `swarmId` and `trackers` as query
  parameters. The player keys are in
  `packages/p2p-media-loader-demo/src/constants.ts`.
- Stop a server the test started when the test ends.

## Every test runs in at least two tabs

Each tab is a peer, and one tab tests playback only: it has no peer, so the
core never elects an owner, never shares, and never opens a peer connection.
Give the tabs a `swarmId` that nobody else uses
([verification.md](../../../specs/verification.md), "Isolating a test
swarm"). A public stream's default swarm can hold strangers, whose peers mix
with the test's.

## The page must be visible

Ask the person to show the browser before the test starts, and to keep it on
screen. In the Claude desktop app this is the built-in browser pane, which is
hidden unless the person opens it. A hidden page gives false results: Chrome
pauses its muted video, and a play after such a pause can move the playhead to
the live edge; a player that waits until it can be seen loads nothing; and the
timers run slower. Open the page with `preview_start` and its URL, which also
brings the pane up, and then check in the page: `document.visibilityState` is
`visible` and `innerWidth` is not 0. A pane the person sees can still hold no
page of this session, which then reports `hidden` at 0×0. A run in a hidden
page is not counted: stop and ask again.

**Keep the other tabs playing.** Only the front tab is visible. Chrome slows
the timers of a hidden tab and pauses video-only background media. Unmute the
video, set a low volume, and call `play()` in each tab. Allow for slower
timers: a step that takes 20 s in the front tab can take 30 s in another, and
a slow start is not a stall until the test has waited for it. Measure live
latency, startup placement, and anything that depends on the player's own
controls in the front tab only, and bring each tab to the front in turn where
a test measures more than one. Opening a second tab can hide the first; a
same-origin iframe in tab A keeps both visible.

## Moving the tabs together

Open each tab with `driver=1` in the query: the dev server then loads the test
driver (`demo/src/test-driver.ts`), which the production build leaves out.
Every driven tab listens on one `BroadcastChannel`. Tab A sends code; every
tab runs it and replies, and tab A collects one reply for each tab it expects.

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

- **Every tab with the driver follows every command.** A tab left over from
  an earlier test silently joins the next one. Before each test, close every
  driven tab that is not part of it, or reload it without `driver=1`.
- **Run long tests in the page.** A browser tool call times out after about
  45 s. `window.__bg(name, task)` runs the test inside tab A and keeps its log
  and result in `window.__R[name]`; read it in later calls of 40 s or less.
- When `all` expects more tabs than answer, it waits for its timeout: a test
  that names a wrong tab count is slow, not wrong.

## The saved scripts

The scripts that ran each release test last time are in
[`demo/release-tests/`](../../../demo/release-tests/): a probe that records
what the core decided beside what the media element held, a library of
helpers, fault wrappers, and one module per test. They are the memory of how
each test was last run. A run that writes its scripts from scratch spends its
time on scripts, and measures differently from the run before it.

1. **Before a run**, read `demo/release-tests/README.md` (how a page loads the
   scripts, which script runs which test, the commit each last ran on) and the
   spec section of each test you run.
2. **Use the saved scripts.** Load the library and the test's script in tab A,
   as the README shows. Use `faults.js` for every injected fault, also outside
   a release run.
3. **Change a script when it is out of date, and keep the change**: a stream
   went offline, a counter was renamed, a selector changed, a wait is too
   short, a measurement reads the wrong thing. Fix it in the folder, not in
   the page. A test with no script gets one, written as a module beside the
   others and run from the file.
4. **Do not edit a script that a page has loaded while a test runs.** Vite
   reloads the page, which stops the test; prettier counts as an edit.
   Results are kept in `localStorage` as they are recorded, so a reload
   between tests loses none: read them back with `results(name)`.
5. **Never put a finding's workaround in a script.** A script that hides a
   defect makes the next run pass it.
6. **Before the run ends**: save every script used or written; update the
   table in the README (the commit each ran on, what changed); run
   `npx prettier --write demo/release-tests`; say in the report which scripts
   changed and why; and remove what the scripts left in the page with
   `clear()` from `lib.js`.

## What to observe

- The media element: `readyState`, `error`, `currentTime`, `buffered`,
  `seekable`, `paused`.
- The demo page: the HTTP and P2P totals, and the peer graph.
- The ledger ([diagnostics.md](../../../specs/diagnostics.md)): enable it in
  each tab, and take `window.__p2pmlDiagnostics.snapshot()` before and after
  each step. It shows what is open, counters of results, and anomalies. Some
  resources are released late by design; the list is in diagnostics.md,
  "What is recorded". It sees only what the library holds: an object a player
  or the demo leaves running shows only as console errors or a growing heap.
- The debug loggers, through `localStorage.debug`, set before the page loads:

  | Logger                       | Shows                                                                      |
  | ---------------------------- | -------------------------------------------------------------------------- |
  | `p2pml-core:registry-miss`   | A player request that the registry does not know                           |
  | `p2pml-core:manifest`        | The registry each manifest gives                                           |
  | `p2pml-core:clock`           | Clock synchronization and re-parses of clock-based lists                   |
  | `p2pml-core:hybrid-loader-*` | Requests and their urgency, and each prefetch "as owner" or "as backup #n" |
  | `p2pml-core:tracker`         | Announces, offers, answers, peers held and released                        |
  | `p2pml:diagnostics`          | Enables the ledger, and logs its anomalies                                 |
  | `p2pml:diagnostics:log`      | Each open and close of a ledger record                                     |

  The browser keeps only the most recent console lines: enable only the
  loggers the test reads. `p2pml-core:*` fills the buffer within a minute.
  Read the lines with the browser tool's console reader and a pattern; a
  patch of `console.log` in the page misses them, because `debug` binds the
  console when it loads.

**Summarize each tab the same way.** For each tab and step: `readyState`,
media error, latency behind the end of the seekable range, the peers held, the
HTTP and P2P downloads and failures of the step (counter differences),
registry misses, peer closes by cause, records still open from before the
step, anomalies, and the swarm of each open P2P loader (the detail of its
`P2PLoader` record).

## Avoiding false results

- **A rendition is a swarm.** "No P2P" between two tabs means nothing until
  their swarms are compared: engines on Auto often pick different renditions.
  Pin the rendition when a test measures sharing between two engines; where a
  player has no selector, compare the swarms of the open P2P loaders.
- **Confirm that each injected fault happened.** Count it where it is
  injected; a test whose fault count is zero did not run. Check that it hit
  the request the test meant: a fault on a download the core then stopped
  tests nothing.
- **A defect is real only when it occurs again in fresh tabs.** For a
  connection defect, keep the `p2pml-core:tracker` log of the failure.
- **Check the cause before blaming the core.** Run the same page without P2P
  — the player alone, same stream, same browser — before calling a playback
  error ours ([investigations.md](investigations.md), "A control without
  P2P").
- Do not edit the source while a test runs: Vite reloads the changed modules,
  and the test measures a mix of old and new code. Reload the tabs between
  test groups.
- `livesim2` allows 10000 requests per IP address per day; its `/reqcount`
  shows the count. Use an HLS live stream for a long run.
- In shell checks, quote and split lists explicitly: `zsh` does not split an
  unquoted variable into words.
- Keep scratch work — tarballs, a worktree of an older release, a consumer
  project — in a scratch directory, and remove it at the end.
