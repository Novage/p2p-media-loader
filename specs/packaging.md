# Packaging and distribution

Core parses manifests, so it depends on a manifest parser. `m3u8-parser` and
`mpd-parser` are not the same size, and not every deployment needs both:

|                 | gzip    |
| --------------- | ------- |
| core, no parser | 28.6 KB |
| `m3u8-parser`   | 7.0 KB  |
| `mpd-parser`    | 31.4 KB |

The DASH parser alone is larger than all of core. This spec describes how a
deployment carries only the parsers it uses.

## Parsers are selected statically

An integration imports the parsers it needs and hands them to core. Core never
resolves a parser at runtime.

```ts
import { Core } from "p2p-media-loader-core";
import { hlsManifestParser } from "p2p-media-loader-core/hls";

const core = new Core({ manifestParsers: [hlsManifestParser] });
```

Two mechanisms are deliberately **not** used:

- **Dynamic `import()`** — the IIFE builds target `es2015` for old television
  browsers, which have no dynamic import. It would also split the bundle into
  sibling chunks that a single-file consumer cannot host.
- **A string-keyed registry populated by side-effect imports** — a bundler
  cannot prove the unused parser is unreachable, so nothing is eliminated.

An explicit value import keeps the reference graph visible, which is what makes
the elimination possible at all.

A parser package may grow beyond the manifest itself. Resolving a DASH
`SegmentBase` index requires reading an MP4 `sidx` box, which belongs with the
DASH parser rather than in core: only DASH deployments should carry it. The
selection mechanism is unchanged — it is still one static import.

### What may be swapped, and what may not

A parser converts bytes into a generic parsed structure. That is all it does.

Deriving the registry, `externalId`, and the stable timeline from that structure
happens in core, always. If interpretation were pluggable, two integrations
could derive identity differently and peers would stop recognising each other —
the guarantee that [segment-identity.md](segment-identity.md) exists to
provide. Integrations supply a tokenizer, never an interpreter.

## Two distribution channels

### `lib/` — unbundled, for bundler consumers

Emitted by `tsc`. Subpath exports map to individual modules:

```
lib/index.js    →  "."         core; imports no parser
lib/hls.js      →  "./hls"
lib/dash.js     →  "./dash"
lib/server.js   →  "./server"
```

`src/index.ts` must import no parser. It is the entry a bundler consumer reaches
through `"."`, and anything it imports becomes unconditional weight for every
consumer regardless of which subpaths they use.

### `dist/` — prebuilt bundles, for script-tag and WebView consumers

Emitted by vite, self-contained, one file each. These consumers resolve no
exports map, so the protocol combination is chosen by filename:

| Bundle                                 | Contents             | gzip   |
| -------------------------------------- | -------------------- | ------ |
| `p2p-media-loader-core.es.min.js`      | core + both parsers  | ~66 KB |
| `p2p-media-loader-core-hls.es.min.js`  | core + `m3u8-parser` | ~36 KB |
| `p2p-media-loader-core-dash.es.min.js` | core + `mpd-parser`  | ~60 KB |

The unprefixed name is the batteries-included build. It keeps the
`p2pml:core-as-bundle` export condition — which points at
`dist/p2p-media-loader-core.es.js` — meaningful for existing consumers.

Because `src/index.ts` carries no parser, each bundle has its own entry module
that composes core with the parsers for that combination. Unminified variants
and source maps are emitted alongside, as for every other bundle.

> **Load exactly one.** Each bundle inlines its own copy of core. Loading two in
> one page produces two independent cores with separate registries, stores and
> peer connections. They will not cooperate, and the failure is silent.

## Where the engine packages fit

`<script type="module">` and IIFE consumers load an **engine** bundle, not core.
`p2p-media-loader-hlsjs` and `p2p-media-loader-shaka` each build `esm`, `esm-min`,
`iife` and `iife-min`, and each inlines core.

Parser selection for those users therefore happens at engine build time and is
invisible to them — no exports map, no import map, no load order, no extra
files:

- `p2p-media-loader-hlsjs` imports the HLS parser only.
- A DASH-only integration would import the DASH parser only.
- `p2p-media-loader-shaka` imports both, because Shaka plays both.

## Where standalone core is actually used

The native proxy runs core in a WebView with no JavaScript player beside it, so
core's own size is the entire payload and the protocol split matters most there.
An iOS application playing HLS loads the HLS bundle and never carries the DASH
parser. See [mobile-proxy.md](mobile-proxy.md).
