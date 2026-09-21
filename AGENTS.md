# Working in this repository

Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot, Jules,
and others) and a useful summary for humans. `CLAUDE.md` and any other
tool-specific file point here; this is the source of truth.

## Specs are part of the code

`specs/` documents the system as designed — the shape the code is meant to have
and the reasoning behind it. It is design documentation, not a roadmap: it
describes the end state, never development phases or a narrative of how the code
got here. Contrasting a decision with the design it replaced is welcome when it
explains _why_ — that is reasoning, not history — and must not be stripped as
such.

**Read before changing.** Before modifying anything that crosses a package
boundary, changes identity derivation, alters the peer protocol, or adds a
player integration, read the relevant spec in `specs/`. Start at
[`specs/README.md`](specs/README.md).

**Update in the same change.** A change that alters designed behaviour updates
the spec that describes it, in the same commit or pull request — not afterwards.
A spec describing behaviour the code no longer has is worse than no spec,
because it is trusted.

**Write the spec first when the design is new.** If a change introduces a
concept `specs/` does not cover, add the spec alongside it.

**Never weaken a spec to match the code.** If code and spec disagree, the code
is wrong, or the design changed deliberately and the spec is rewritten to state
the new design. Silently editing a spec to describe a regression is not
permitted.

**No phases, dates, or status in specs.** Write what the system does, in the
present tense. Where code does not yet match the spec, track the gap in the
issue tracker.

**`specs/proposals/` is the one exception.** A proposal describes a design the
system does not have, together with the measurement that would justify
building it. It is not a spec: nothing in it may be cited as how the system
behaves. When a proposal is adopted, fold it into the spec it extends and
delete it; when rejected, delete it.

## Conventions

- **Package manager: pnpm.** The workspace is `packages/*` and `demo`. Never run
  `npm install` in a workspace package.
- **Verify before reporting done:** `pnpm type-check`, `pnpm lint`, `pnpm test`,
  and `npx prettier --check "specs/**/*.md" AGENTS.md` when specs changed.
- **Before a release:** `pnpm knip` as well, with no findings, and `pnpm jscpd`
  within its budget. See [`specs/packaging.md`](specs/packaging.md).
- Match the surrounding code's style, comment density and naming. The codebase
  favours comments that explain _why_ over comments that restate the code.

## The peer protocol is a contract

`PEER_PROTOCOL_VERSION` appears in every stream swarm ID. Any change to how
`identityHash` or `externalId` is derived — including changes that look
cosmetic, such as a different codec-string normalization or a different segment
numbering base — makes peers unable to find each other and **requires bumping
the version**.

Identity is frozen by golden vectors in the core test suite. Those vectors are
the wire format, not expectations to be refreshed when they fail. A change that
breaks them is a protocol change: bump the version and add a new set, keeping
the old ones. See [`specs/segment-identity.md`](specs/segment-identity.md).

The version marks releases peers can meet across. Between the last release
and the next, a derivation may still change under one version — new golden
vectors are added, none are broken — because a pre-release is not a
compatibility target; the changelog says what moved. Once a version has
shipped in a release, that door is closed.

## Things that are deliberate, not oversights

- **The segment registry is keyed by URL.** A parse disagreement must degrade to
  "no P2P for this segment", never to wrong bytes.
- **Core never compares a manifest time to a player time.** See
  [`specs/playback-contract.md`](specs/playback-contract.md).
- **Adapters do not describe streams to core.** Three responsibilities only; see
  [`specs/player-adapters.md`](specs/player-adapters.md).
- **Adapters whitelist manifest and segment requests and pass every other type
  through.** Never an exclusion list. See [`specs/encryption.md`](specs/encryption.md).
- **Core handles ciphertext only.** It never decrypts, and never stores or seeds
  decrypted media.
- **Low-latency extensions are parsed in order to be ignored** — LL-HLS parts
  and hints, LL-DASH chunked segments. Nothing at the live edge is shareable.
