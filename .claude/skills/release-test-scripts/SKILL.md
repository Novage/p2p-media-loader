---
name: release-test-scripts
description: Use when running the release tests in specs/release-testing.md, or writing any code that drives the demo's tabs for a test. The scripts for those tests are saved in demo/release-tests/ and kept current; load and reuse them instead of writing them again, update them when they no longer match the code, the streams or the spec, and save every new or changed script before the run ends.
---

# Release test scripts

The browser tests of [specs/release-testing.md](../../../specs/release-testing.md)
are run by scripts saved in [`demo/release-tests/`](../../../demo/release-tests/).
They are the memory of how each test was last run: what it measures, how it
waits, how it reads the ledger. A run that writes its scripts from scratch
spends its time on scripts instead of the release, and measures differently
from the run before it.

## Before a run

1. Read `demo/release-tests/README.md`: how a page loads the scripts, which
   script runs which test, and the commit each script was last run on.
2. Read the spec section of each test you run. The spec decides what a test
   checks; a script is only how it is checked. Where the two disagree, the
   spec is right and the script is out of date.

## During a run

- **Use the saved scripts.** Open the tabs with `driver=1`, then load the
  library and the test's script in tab A, as the README shows.
- **Change a script when it is out of date, and keep the change.** A stream
  went offline, a counter or record was renamed, a player's selector changed,
  a wait is too short, a measurement reads the wrong thing: fix the script in
  `demo/release-tests/`, not in the page. Changing the test scripts is allowed
  during a run; changing the source, the unit tests, the specs or the guides
  is not ([release-testing.md](../../../specs/release-testing.md),
  "Findings").
- **A script that changes while a page has it loaded** is reloaded by Vite
  with the page. Results are saved in the page's `localStorage` as they are
  recorded (`keep` in `lib.js`), so a reload loses nothing; read them back
  with `results(name)`.
- **A test that has no script yet** gets one, written as a module beside the
  others and run from the file, not pasted into the page.
- Never put a finding's workaround in a script. A script that hides a defect
  makes the next run pass it.

## Before the run ends

1. Every script used or written in the run is saved in `demo/release-tests/`.
2. Update the table in `demo/release-tests/README.md`: the commit each script
   ran on, and what changed in it.
3. Run `npx prettier --write demo/release-tests`.
4. Say in the run's report which scripts changed and why, and commit them
   with the run's other committed changes, or ask the person to.
5. Remove what the scripts left in the page: `clear()` in `lib.js` removes the
   saved results and the probe's settings from `localStorage`.
