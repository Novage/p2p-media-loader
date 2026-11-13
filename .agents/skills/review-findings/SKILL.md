---
name: review-findings
description: Use when a code review of this repository — by a person, a tool or an agent — returns findings. How to check each finding against the code, which to fix now, where to record the rest (KNOWN-ISSUES.md or specs/proposals/), how to present them for a decision, and when to stop review rounds.
---

# Review findings

A review finds more than is worth fixing. Each fix is new code, and new code
gets new findings. This skill keeps the fixes to what matters, records the
rest where the next reader finds it, and says when to stop.

## 1. Check each finding against the code

Before judging a finding, establish what it is. Cite `file:line` for each
answer.

- **Is the failure real with the code as it is?** Follow the callers. A
  finding that needs a caller, a path or a setting that does not exist is
  hypothetical.
- **Is it new?** Compare with the base of the change (`git show
  <base>:<path>`). A finding the code already had before the change is not a
  defect of the change.
- **Did the last round's fixes cause it?** Those findings are the sign to
  watch in step 5.
- **Is the case realistic?** Who must do what, how often, for it to occur.

## 2. The bar: what is fixed now

Fix now only a finding that, in a realistic case:

- **affects playback**: a stall, a wrong or lost segment, a request never
  served, a download loop; or
- **blames an honest party**: closes an honest peer, spends an HTTP attempt
  for a peer's fault, or reports the origin at fault for a peer's bytes.

A document that states something false is fixed too: it costs little, and a
false spec is trusted.

Everything else is recorded or left (step 3), also when the fix looks small.
Prefer the simplest fix. A fix that adds code for a rare case is a cost
without a benefit: record the case instead. A fix that a reviewer found risky
can be reverted to the code as it was, when the original had no real fault.

Each fix follows the [change checklist](../change-checklist/SKILL.md): a test
that fails without the fix, the documents, the diagnostics.

## 3. Record the rest

| What it is                                                          | Where                                                                                                     |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| A real defect, not fixed now                                        | [KNOWN-ISSUES.md](../../../KNOWN-ISSUES.md), "Open"                                                       |
| Seen once in a test, not reproduced                                 | KNOWN-ISSUES.md, "Watch: seen once, not reproduced"                                                       |
| Caused by a player, an origin, a browser or a stream, not this code | KNOWN-ISSUES.md, "Explained: not a defect in P2P Media Loader"                                            |
| A behaviour kept on purpose, with its reason                        | KNOWN-ISSUES.md, "Decided: kept by design"                                                                |
| A design the system does not have, worth building after a measure   | [specs/proposals/](../../../specs/proposals/), and its row in [specs/README.md](../../../specs/README.md) |
| Hypothetical, cosmetic, or below the bar for good                   | Nothing: name it in the report only                                                                       |

An entry says what happens, when, the evidence, and why it is not fixed now.
A proposal says the gap, the design, and the measurement that decides it.

## 4. Present the findings for a decision

The person who asked for the review decides what is fixed. Before changing
code, give one row per finding: what it claims, whether it is real, new and
realistic, and the recommendation — fix now, record (where), or leave. Then
make what the person chose, and no more.

## 5. When to stop the review rounds

A round that finds real faults is followed by another, after the fixes. Stop
when a round finds only:

- edges of the previous round's own edits,
- issues the code had before the change, or
- cases that need code that does not exist.

The code has then converged; another round would review its own last edits
and find new edges for ever. Recommend to stop, and commit.

When round after round finds real faults in one area, the cause is often the
area's shape — state spread over several objects, so that each change leaves
a field behind. Propose a refactor of the area before more fixes, and review
the refactor on its own.

## 6. The commits

Commit the fixes of a round on their own, not inside a refactor commit. The
message names each behaviour change, so that a reader looking for one finds
it.
