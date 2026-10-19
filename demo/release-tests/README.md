# Release test scripts

The scripts that run the browser tests of
[specs/release-testing.md](../../specs/release-testing.md). The spec says what
each test checks; these scripts are how the last run checked it. Keep them
current: a run fixes a script that no longer matches the code, a stream or the
spec, writes one for a test that has none, and records here what it changed.
The skill [`browser-testing`](../../.agents/skills/browser-testing/SKILL.md)
says how a run uses them.

They are plain ES modules. The dev server serves them at `/release-tests/`;
the production build, ESLint, `tsc` and knip leave them out, as they leave out
the driver's own test code.

## Loading them

1. Start the demo (`pnpm dev`) and set, in any tab of `http://localhost:5173`,
   before the test tabs load:

   ```js
   localStorage.debug =
     "p2pml:diagnostics,p2pml-core:registry-miss,p2pml-core:hybrid-loader-*";
   ```

   Add `p2pml-core:tracker` for test 7, which counts glare lines.

2. Open each test tab with `driver=1` in its query (the skill's "Moving the tabs together"). In tab A:

   ```js
   const rt = await import("/release-tests/lib.js");
   await rt.inAll(2, "installProbe"); // in every tab, before the test
   const matrix = await import("/release-tests/matrix.js");
   matrix.run({ name: "matrix" }); // runs in the page's background
   ```

3. Read the results as they come: `rt.results("matrix")`, and
   `matrix.summarize(rt.results("matrix"))` for one line per tab and step.
   Results are kept in `localStorage`, so a reload of the page loses none.
   `rt.clear()` removes them at the end of the run.

**Do not edit a script that a page has loaded while a test runs.** Vite
reloads the page, which stops the test; formatting one with prettier counts
as an edit. Edit between tests, then reload the
tabs and install the probe again.

## The scripts

| Script         | Test                   | Last run on | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------- | ---------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib.js`       | all                    | `59335dd`   | Streams of verification.md, the probe, snapshots, `inAll`, results kept in `localStorage`, `settle` that waits for playback and a peer                                                                                                                                                                                                                                                                                                                                                                                                  |
| `matrix.js`    | 2. Stream matrix       | `59335dd`   | `smokeSteps()`: one VOD and one live stream per protocol on every engine; `fullSteps()`: the whole matrix                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `faults.js`    | 10. Network faults     | `59335dd`   | Wrappers of fetch, XMLHttpRequest and WebSocket; segment 404, 503 and no answer, one manifest error, slow network, trackers dropped or unreachable; `runNoWebRtc`. Each segment request is logged; `retryGaps` gives how soon a failed request was made again (the same URL and the same end of its byte range, so that a retry that resumes from held bytes counts), from a log of the latest 2000 segment requests; `runSegmentFaults` runs a phase with no fault, then 503, 404 and no answer at a 0.6 chance, to compare two builds |
| `joins.js`     | 7. Simultaneous joins  | `59335dd`   | Time until every tab holds a peer after a common swarm change; glare lines when the tracker logger is on                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `peers.js`     | 8. Three to five peers | `06367ea`   | Measures only; the browser driver opens and closes the tabs. `start`, `mark` before each event, `since` after it; HTTP downloads per segment one tab holds                                                                                                                                                                                                                                                                                                                                                                              |
| `pause.js`     | 3. Pause               | `59335dd`   | One step per engine and stream type (live, DVR, VOD); A pauses 40 s while B plays; on DVR, A seeks to the middle of the window first. Storage sampled every 10 s of the pause. Its rows compare snapshots within a step, so they show no leak column                                                                                                                                                                                                                                                                                    |
| `rate.js`      | 5. Playback rate       | `59335dd`   | A at 2 and B at 1, both at 2, A at 1.5, 0.5 and 1, a seek at 2; each tab samples its own speed, `waiting` events and buffer ahead. `frames` counts since the player loaded, so a share read after a 2× phase stays high in the phases after it                                                                                                                                                                                                                                                                                          |
| `quality.js`   | 6. Quality switches    | `59335dd`   | Uses `select.quality-selector`. Tabs share a rendition when a `PeersHeld:<swarm>` probe holds a peer in both: the old rendition's P2P loader stays open for `p2pInactiveLoaderDestroyTimeoutMs` by design, so comparing loader lists reads about 30 s too long                                                                                                                                                                                                                                                                          |
| `lifecycle.js` | 9. Lifecycle           | `59335dd`   | 20 changes of stream or player 0.6–1.8 s apart, then the last stream; open records by kind before and after. Two players on one page are not scripted                                                                                                                                                                                                                                                                                                                                                                                   |
| `config.js`    | 12. Configuration      | `59335dd`   | Needs the temporary demo edit of test 12 (`p2p=0`, `upload=0`, `hook=1`; the hook counts its calls in `window.__hookCalls`); per-tab `swarmId`, P2P off, upload off in B, the hook, the IndexedDB example                                                                                                                                                                                                                                                                                                                               |

Test 14 and the low-latency streams of test 11 ran on `59335dd` through
`matrix.run({ steps })`, with the special streams of `lib.js` as its steps;
the resource timing of the AES-128 step shows who fetched the key. Tests 4,
13 and the rest of 11 were last run on 13 October 2026 from scripts pasted
into the page, before this folder existed. Write their modules from the spec
the next time they run.

## Lessons the scripts encode

- Wait on conditions (`settle`), not fixed times: two tabs usually play and
  hold a peer within 10–15 s, and a fixed 40 s wait spends the difference on
  every step.
- The `debug` module's URL carries a hash that changes when Vite re-bundles;
  the probe finds it among the page's resources rather than by name.
- A rendition is a swarm. Before calling "no P2P" a defect, compare the two
  tabs' swarms (`loaders` in `state()`): engines on Auto often pick different
  renditions.
- Shaka stalls on the Netflix SegmentBase stream in a background tab, with P2P
  or without it; judge that combination in the front tab only.
- dash.js applies a manual quality change 25–30 s late on live, after the
  segments it already holds; a quality step must wait for the switch.
- angel-one is about a minute long: too short for the playback rate test.
- Seek timings on one machine are noisy: run each comparison as a median of
  three from the start.
- A fault chance of 0.3–0.4 can inject nothing in a 30 s phase: a tab that
  gets most segments from its peer makes one or two HTTP requests. Check the
  fault count of each phase; `runSegmentFaults` uses 0.6.
- Two peers on the 4×5 s Akamai stream need about 7.4 Mbit/s on one link.
  On a slower link the run measures the network (timeouts, aborts, both tabs
  stopped). Compare two builds on the DVR stream, where HLS.js chooses a
  rendition that fits the link.
- Keep tab B as a same-origin iframe in tab A, fixed to the lower half of
  the page: both pages are then visible, and a reload of tab A removes it,
  so add it again after each reload.
- `faults.run` injects segment faults at 0.3–0.4 in tab A, which then gets
  most segments from B: on the live HLS stream its 404 and 503 phases
  injected none. Use `runSegmentFaults` for the segment faults.
- Shaka on a live stream whose window the pause outlives jumps into the
  window on resume and rebuffers for 4–5 s, with P2P or without it (the
  control of test 3): it is the player's, not a stall of the core.
- A P2P loader is recorded by its stream swarm (`P2PLoader <id>`), a peer by
  the info hash (`PeersHeld:<hash>`); nothing in the snapshot maps one to
  the other, so a test that asks "do both tabs hold a peer in this
  rendition" cannot yet name the rendition.
