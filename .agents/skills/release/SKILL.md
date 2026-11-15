---
name: release
description: Use when preparing a release or a pre-release of the packages — the order of the checks and the release tests, the documents to review, the peer-protocol version, the pull request description, and how a tag publishes to npm.
---

# Release

What is tested before a release, and what must pass, is in
[specs/release-testing.md](../../../specs/release-testing.md). This is the
order of the work around it.

## 1. Automated checks

Run release test 1 (release-testing.md, "Automated checks"): type check,
lint, unit tests, knip, jscpd, build, typedoc, packing, and prettier on the
specs. Why knip must report nothing and how jscpd's budget is spent is in
[specs/packaging.md](../../../specs/packaging.md), "Before a release": a knip
finding is fixed by removing the code or narrowing the export, and a false
positive by a reasoned entry in `knip.jsonc`, never by ignoring the report.

## 2. The release tests

- **Part 1** is run by an AI assistant with the
  [browser-testing](../browser-testing/SKILL.md) skill. Plan for about five
  hours. A run fixes nothing: it reports its findings at the end, and stops
  at once only when core functionality is broken (release-testing.md,
  "Findings").
- **Part 2** is run by a person: other devices, networks and browsers. Give
  the person its list; the release waits for it.
- Each run adds a line to [KNOWN-ISSUES.md](../../../KNOWN-ISSUES.md),
  "Release test runs": the run, its dates, the tests that passed and the
  commits they ran on, and what was found. Each finding not fixed gets its
  entry there.

## 3. The documents

- **[CHANGELOG.md](../../../CHANGELOG.md)**: the version's section lists every
  change of the release, and each entry still matches the code.
- **[MIGRATION.md](../../../MIGRATION.md)**: every breaking change has its
  upgrade step.
- **[KNOWN-ISSUES.md](../../../KNOWN-ISSUES.md)**: no fixed issue is left in
  it, and each open one is current.
- The README, `api_documentation.md` and the `@example` blocks: release tests
  17 and 18 check them.

## 4. The peer-protocol version

Peers meet only when their `PEER_PROTOCOL_VERSION` matches. If any identity
derivation changed since the last release that shipped, the version must
differ from that release's (AGENTS.md, "The peer protocol is a contract").
Between releases a derivation may still change under one version; once a
version has shipped, it is closed.

## 5. The pull request description

The release branch's pull request has a description that summarizes the
release and points to CHANGELOG.md, MIGRATION.md, the specs and
KNOWN-ISSUES.md for the details; where the description and a file differ, the
file is right.

- No commit hashes and no exact test counts: they change with every commit.
- Update it at a milestone — a new feature, a decision, a changed release
  state, such as a release test run — or when asked, not after every commit.
- The "Verification" section says which release tests ran, on which code,
  and what has not run since.

## 6. Publishing

A tag pushed to GitHub publishes the packages to npm:
`.github/workflows/npm-publish.yml` runs on `vX.Y.Z` and on `vX.Y.Z-<pre>`,
for example `v5.0.0-alpha.4`. It takes the version from the tag and writes it
into each package and into the WebTorrent client, builds, replaces each
package's README symlink with the root README, packs and publishes. A pre-release goes under the npm tag named
by its identifier (`alpha` for `-alpha.4`); a release under `latest`.

Tagging and pushing publish the packages for everyone: an agent does it only
when the person asks for that release.
