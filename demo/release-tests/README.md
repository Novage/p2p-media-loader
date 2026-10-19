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

| Script      | Test                   | Last run on | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------- | ---------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib.js`    | all                    | `8f93cc0`   | Streams of verification.md, the probe, snapshots, `inAll`, results kept in `localStorage`, `settle` that waits for playback and a peer                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `matrix.js` | 2. Stream matrix       | `8f93cc0`   | `smokeSteps()`: one VOD and one live stream per protocol on every engine; `fullSteps()`: the whole matrix                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `faults.js` | 10. Network faults     | `2aa498a7`  | Wrappers of fetch, XMLHttpRequest and WebSocket; segment 404, 503 and no answer, one manifest error, slow network, trackers dropped or unreachable; `runNoWebRtc` (run on `06367ea`). Each segment request is logged; `retryGaps` gives how soon a failed request was made again (the same URL and the same end of its byte range, so that a retry that resumes from held bytes counts), from a log of the latest 2000 segment requests; `runSegmentFaults` runs a phase with no fault, then 503, 404 and no answer at a 0.6 chance, to compare two builds |
| `joins.js`  | 7. Simultaneous joins  | `8f93cc0`   | Time until every tab holds a peer after a common swarm change; glare lines when the tracker logger is on                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `peers.js`  | 8. Three to five peers | `06367ea`   | Measures only; the browser driver opens and closes the tabs. `start`, `mark` before each event, `since` after it; HTTP downloads per segment one tab holds                                                                                                                                                                                                                                                                                                                                                                                                 |

Tests 3, 4, 5, 6, 9, 11, 13 and 14 were last run on 13 October 2026 from
scripts pasted into the page, before this folder existed. Write their modules
from the spec the next time they run.

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
