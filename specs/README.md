# Specifications

Design documentation for P2P Media Loader. These specs describe **the system as
designed** — the shape the code is meant to have, and the reasoning behind it.
They are not a changelog, a roadmap, or a migration guide.

Read them when you need to know _why_ something is built the way it is, or
before changing anything that crosses a package boundary.

| Spec                                         | Covers                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| [architecture.md](architecture.md)           | How responsibility is divided between core and player adapters               |
| [manifest-registry.md](manifest-registry.md) | Manifest parsing, the stream and segment registry, timeline stability        |
| [segment-identity.md](segment-identity.md)   | Canonical segment and stream identity; what is on the wire                   |
| [playback-contract.md](playback-contract.md) | How core learns where the player is and how urgent a request is              |
| [prefetch.md](prefetch.md)                   | Which peer fetches a segment over HTTP so that the rest can share it         |
| [player-adapters.md](player-adapters.md)     | What an adapter must do, for every supported player                          |
| [encryption.md](encryption.md)               | What core may and may not do with protected content                          |
| [mobile-proxy.md](mobile-proxy.md)           | Native players via a local HTTP proxy and a WebView-hosted core              |
| [packaging.md](packaging.md)                 | How parsers are selected, and what each consumer downloads                   |
| [verification.md](verification.md)           | The real streams the design is verified against, and what is checked on them |

## Proposals

[`proposals/`](proposals/) holds designs that are **not** part of the system:
candidate extensions recorded with the measurement that would justify building
them. A proposal describes the gap, the design, and the decision rule, so the
choice is made on data rather than recollection. When a proposal is adopted it
is folded into the spec it extends and removed from the folder; when it is
rejected it is deleted.

| Proposal                                                                 | Would close                                               |
| ------------------------------------------------------------------------ | --------------------------------------------------------- |
| [p2p-inflight-announcements.md](proposals/p2p-inflight-announcements.md) | Duplicate HTTP fetches by backups on slow relay chains    |
| [cmcd-playback-source.md](proposals/cmcd-playback-source.md)             | Inferred playback state where a proxied player emits CMCD |

## Keeping these current

Specs are maintained alongside the code, in the same change. A spec that
describes behaviour the code no longer has is worse than no spec, because it is
trusted. See [`AGENTS.md`](../AGENTS.md) for the rules that apply to every
change, human or AI.

Where the code does not yet match a spec, the spec describes the target and the
gap is tracked in the issue tracker — never by weakening the spec to match the
code.
