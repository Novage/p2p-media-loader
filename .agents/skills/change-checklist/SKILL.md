---
name: change-checklist
description: Use while making a change to packages/* and before reporting it done — which documents the change updates in the same commit, the diagnostics checklist, how to prove that a new test fails without the change, the peer-protocol rule, the checks to run, and what the report and the commit message say.
---

# Change checklist

The rules are in [AGENTS.md](../../../AGENTS.md); this is how to follow them
for one change. Go through every section, also for a small change: the
documents and the diagnostics are what a change most often leaves behind,
because nothing fails when they are missing.

## Before the change

- Read the spec of the area ([specs/README.md](../../../specs/README.md)). A
  change that crosses a package boundary, changes identity, alters the peer
  protocol or adds a player integration needs it.
- Read the area's entries in [KNOWN-ISSUES.md](../../../KNOWN-ISSUES.md):
  what is open, what was explained, and what was decided and kept by design.
  A decision there is not reopened without new evidence.

## Documents the change updates, in the same commit

- **The spec** that describes the changed behaviour. A new concept gets a
  spec. Never weaken a spec to match the code.
- **[CHANGELOG.md](../../../CHANGELOG.md)**, under the release being made:
  "Added", "Changed", "Removed", or "Fixed" for a defect that also affects
  the previous major version. Say what changed and why, with a number where
  one was measured.
- **[MIGRATION.md](../../../MIGRATION.md)** for a change to the public API or
  to a default an integrator must act on.
- **[KNOWN-ISSUES.md](../../../KNOWN-ISSUES.md)**: a fix removes its entry; an
  issue found and not fixed gets one, in the right section.
- **The API documentation**: [README.md](../../../README.md),
  [api_documentation.md](../../../api_documentation.md), and the `@example`
  blocks in the source.
- **The skills** in `.agents/skills/`, when the change makes a procedure in
  one wrong, and the test scripts in `demo/release-tests/` when it renames a
  counter, a record or a setting they read.

## Diagnostics

The rules are in [diagnostics.md](../../../specs/diagnostics.md), "Rules". For
a change to `packages/*/src`, check each item, and say in the report what was
added or why nothing was needed:

1. **Resources.** Each listener, timer, connection, registration, storage,
   request or kept object the change acquires has an `open` where it is
   acquired and a `close` on every path that releases it: destroy, failure,
   replacement. Each timer is cleared on destroy, and its callback records an
   anomaly if it runs after destroy (rule 2). A timer scheduled more than once
   keeps one record at a time.
2. **Results.** Each new outcome — a branch that fails, falls back, corrects,
   or decides on the player's behalf — has a counter (rule 3), for each way it
   can go, not only the interesting one.
3. **Drift.** A value that two parts of the code must agree on has a probe
   (rule 4).
4. **A test.** A unit test enables the ledger and checks that after teardown
   no resource of the change's kinds is open and no anomaly was recorded, and
   that the counters move as the change says (rule 8). Removing the change's
   release step must make that test fail.
5. **The spec.** diagnostics.md, "What is recorded", names any new group of
   counters a reader of a snapshot must know.

## Tests

- Each rule the change adds or changes has a test that reads the rule, not the
  implementation.
- **Prove that each new test can fail.** Break the rule in the source on
  purpose — remove the check, invert the condition, drop the release step —
  run the tests, see the new test fail, and restore the source. A test that
  still passes tests nothing. Never leave or commit the broken version; check
  with `git diff` that the source is back.
- Do not edit an existing test to make it pass unless the change means to
  alter the behaviour it reads; say so in the report.

## The peer protocol

A change to how the default `streamId` or `externalId` is derived is a protocol
change, however small it looks: see AGENTS.md, "The peer protocol is a
contract", and [segment-identity.md](../../../specs/segment-identity.md). The
golden vectors are the wire format: a change that breaks them bumps
`PEER_PROTOCOL_VERSION` and adds a new set, keeping the old ones.

## Checks

Run from the repository root, and fix every finding:

- `pnpm type-check`. It runs `tsc --noEmit` in each package. Do not run
  `tsc -b`: it writes `.js` and `.d.ts` files into `src/` and `test/`.
- `pnpm lint`
- `pnpm test`
- `npx prettier --check` on every changed file outside a package's `src/`:
  specs, AGENTS.md, the skills, the root documents, the demo's pages.
- `pnpm knip` when the change adds, moves or removes an export.

Leave the git index as you found it: do not stash, reset or rebuild it to get
a baseline. For a baseline, use a worktree of the base commit in a scratch
directory.

## The report and the commit

- **The report** says what changed and why; each behaviour change; what was
  added to the ledger, or why nothing was; the new tests and that each was
  seen to fail without the change; the checks run and their results; and any
  step skipped, with the reason.
- **The commit message** names the behaviour changes. A commit that claims no
  behaviour change — a refactor — makes none: the existing tests pass
  unedited. Fixes found while refactoring go in a commit of their own.
