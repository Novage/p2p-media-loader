# Specifications

Design documentation for P2P Media Loader. These specs describe **the system as
designed** — the shape the code is meant to have, and the reasoning behind it.
They are not a changelog, a roadmap, or a migration guide.

Read them when you need to know _why_ something is built the way it is, or
before changing anything that crosses a package boundary.

| Spec                                         | Covers                                                                |
| -------------------------------------------- | --------------------------------------------------------------------- |
| [architecture.md](architecture.md)           | How responsibility is divided between core and player adapters        |
| [manifest-registry.md](manifest-registry.md) | Manifest parsing, the stream and segment registry, timeline stability |
| [segment-identity.md](segment-identity.md)   | Canonical segment and stream identity; what is on the wire            |
| [playback-contract.md](playback-contract.md) | How core learns where the player is and how urgent a request is       |
| [player-adapters.md](player-adapters.md)     | What an adapter must do, for every supported player                   |
| [encryption.md](encryption.md)               | What core may and may not do with protected content                   |
| [mobile-proxy.md](mobile-proxy.md)           | Native players via a local HTTP proxy and a WebView-hosted core       |
| [packaging.md](packaging.md)                 | How parsers are selected, and what each consumer downloads            |

## Keeping these current

Specs are maintained alongside the code, in the same change. A spec that
describes behaviour the code no longer has is worse than no spec, because it is
trusted. See [`AGENTS.md`](../AGENTS.md) for the rules that apply to every
change, human or AI.

Where the code does not yet match a spec, the spec describes the target and the
gap is tracked in the issue tracker — never by weakening the spec to match the
code.
