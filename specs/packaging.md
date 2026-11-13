# Packaging and distribution

Core parses manifests, so it depends on a manifest parser. `m3u8-parser` and
`mpd-parser` are not the same size, and not every deployment needs both:

|                                  | gzip    |
| -------------------------------- | ------- |
| core, no parser                  | 29.6 KB |
| `m3u8-parser`                    | 7.0 KB  |
| `mpd-parser` with its XML parser | 31.4 KB |
| `mpd-parser` on the platform's   | ~8 KB   |

As published, the DASH parser alone is larger than all of core — almost
entirely an XML parser browsers do not need. This spec describes how a
deployment carries only the parsers it uses, and none of that.

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
DASH parser rather than in core: only DASH deployments carry it. A parser
therefore offers an optional second tokenizer, `parseSegmentIndex`, which the
DASH parser supplies and the HLS parser does not; core asks the parsers it was
given rather than reading the box itself, so nothing links the reader into a
bundle built for a protocol that lists its segments in the manifest. It
arrives by the same route the parser does: one static import, nothing resolved
at runtime.

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

| Bundle                                 | Contents             | gzip  |
| -------------------------------------- | -------------------- | ----- |
| `p2p-media-loader-core.es.min.js`      | core + both parsers  | 56 KB |
| `p2p-media-loader-core-hls.es.min.js`  | core + `m3u8-parser` | 46 KB |
| `p2p-media-loader-core-dash.es.min.js` | core + `mpd-parser`  | 49 KB |

Measured from the build, as Vite reports it. By difference, core alone is
about 38 KB; the HLS parser adds about 8 KB and the DASH parser about 10 KB,
and the two share their small common dependencies.

None of these bundles, nor the engine packages' bundles, carries the
diagnostics ledger ([diagnostics.md](diagnostics.md)). Every Vite build here
defines `__P2PML_DIAGNOSTICS__` as `false` (`bundleDefines` in
`vite.common.config.ts`), and the minifier removes the ledger and every call
into it: about 1.4 KB gzipped of the core, and up to 0.15 KB of each engine
bundle. `lib/` keeps the ledger, so a bundler consumer can turn it on.

### What the parsers drag in, and what is left behind

Both parsers are published as Babel builds for Node and browser alike, so their
own imports carry things a browser bundle must not: `mpd-parser` imports
`@xmldom/xmldom`, a complete XML parser weighing 70 KB minified, because Node
has no `DOMParser`; `m3u8-parser` imports one `@babel/runtime` helper,
`_extends`. Every browser and WebView has both `DOMParser` and `Object.assign`.

Bundles built in this repository substitute the platform implementations for
both, through `resolve.alias` in `vite.common.config.ts`, applied to **builds
only** — tests run in Node and resolve the real packages. This removes about
25 KB gzipped from every bundle that carries the DASH parser, and it is why no
bundle here contains xmldom or a parser's Babel helper.

The IIFE bundles do carry one helper of their own: downlevelling to ES2015
emits a `typeof` helper, which the toolchain labels the way Babel labels its
own. It is a few hundred bytes and comes from the target, not from a
dependency; the ESM bundles, which are not downlevelled, have none.

The DASH tokenizer also installs a three-line `Object.values` polyfill, because
mpd-parser's build calls that ES2017 builtin once and the IIFE builds target
Chromium 49-era devices, which gained it in Chromium 54. It is installed by an
explicit call in the DASH tokenizer, not a bare import — this package declares
`sideEffects: false`, so a consumer's bundler may drop an import that exports
nothing — and the tokenizer alone calls it, so HLS bundles never include it and
both protocols keep the same runtime floor.

The substitution reaches every bundle this repository produces: the core `dist/`
variants and the engine packages' bundles. It cannot reach an integrator who
consumes `lib/` through their own bundler, because the offending import lives
inside `mpd-parser`, not in this code. For such an integrator playing DASH the
core exports the same replacement as `p2p-media-loader-core/shims/xmldom`, to
alias `@xmldom/xmldom` to; the README's "Reduce the Bundle Size" shows the
alias for Vite and webpack. Its export has a `default` condition beside
`import`: an alias applies to every module in the build, and some packages
load `@xmldom/xmldom` with `require()`, which finds `DOMParser` on the module
just as on the original.

The Babel helper has no such export. Other packages in a typical build — Video.js's
`@videojs/xhr`, for one — `require()` the CommonJS helper, which is the
function itself, while a module's default export arrives as an object. An
alias that sent them to a replacement would break them, to save a few hundred
bytes.

The unprefixed name is the batteries-included build, for a page whose import
map names one file for every specifier.

**The exports map names `lib/` and nothing else.** A consumer who wants a
bundle points every specifier at it, through an import map or a bundler alias,
by the same rule the tables below follow: the core and the parser subpaths
must resolve to one file, or a page gets two copies of every parser,
`@xmldom/xmldom` back in a browser build, and parsers from a different module
instance than the core they are passed to.

Because `src/index.ts` carries no parser, each bundle has its own entry module
that composes core with the parsers for that combination. Unminified variants
and source maps are emitted alongside, as for every other bundle.

> **Load exactly one.** Each bundle inlines its own copy of core. Loading two in
> one page produces two independent cores with separate registries, stores and
> peer connections. They will not cooperate, and the failure is silent.

## Where the engine packages fit

`<script type="module">` and IIFE consumers load an **engine** bundle, not core.
`p2p-media-loader-hlsjs`, `p2p-media-loader-shaka`, `p2p-media-loader-dashjs`
and `p2p-media-loader-videojs` each build `esm`, `esm-min`, `iife` and
`iife-min`. The two kinds carry different things.

The **IIFE** bundles inline core and the engine's parsers: one file, no import
map, no load order. Parser selection happened at engine build time —
`p2p-media-loader-hlsjs` imports the HLS parser only, `p2p-media-loader-dashjs`
the DASH parser only, `p2p-media-loader-shaka` and `p2p-media-loader-videojs`
both, because Shaka and VHS play both — and is invisible to the page.

The **ESM** bundles inline neither. They import `p2p-media-loader-core` and the
parser subpaths by bare specifier, and the page's import map resolves those
specifiers. Every one of them must point at the **same** core bundle — one
module instance, so one core, with the parsers exported from the same file —
and that bundle must carry the parsers the engine imports:

| Engine                     | Specifiers to map                                                                  | Core bundle                            |
| -------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------- |
| `p2p-media-loader-hlsjs`   | `p2p-media-loader-core`, `p2p-media-loader-core/hls`                               | `p2p-media-loader-core-hls.es.min.js`  |
| `p2p-media-loader-shaka`   | `p2p-media-loader-core`, `p2p-media-loader-core/hls`, `p2p-media-loader-core/dash` | `p2p-media-loader-core.es.min.js`      |
| `p2p-media-loader-dashjs`  | `p2p-media-loader-core`, `p2p-media-loader-core/dash`                              | `p2p-media-loader-core-dash.es.min.js` |
| `p2p-media-loader-videojs` | `p2p-media-loader-core`, `p2p-media-loader-core/hls`, `p2p-media-loader-core/dash` | `p2p-media-loader-core.es.min.js`      |

A missing entry fails at module resolution, loudly, before anything runs.
Mapping the specifiers to different files loads two cores (see the warning
above). The parsers are externalized rather than inlined because every core
bundle carries its parsers already; an inlined copy in the engine would ship
each parser twice.

For bundler consumers none of this applies: their own imports select the
parsers and their bundler carries each module once.

## Where standalone core is actually used

The native proxy runs core in a WebView with no JavaScript player beside it, so
core's own size is the entire payload and the protocol split matters most there.
An iOS application playing HLS loads the HLS bundle and never carries the DASH
parser. See [mobile-proxy.md](mobile-proxy.md).

## Before a release

### `pnpm knip` — nothing unused ships

Every module under `src/` is emitted to `lib/` and published, so an `export`
nobody calls is not only dead code: it is a deep-importable surface a consumer
can start depending on, and it lands in the bundle for anyone whose tooling
does not tree-shake. `pnpm knip` reports unused files, exports and dependencies
across the workspace. Run it before cutting a release and leave it with no
findings — by deleting the code, or by narrowing an `export` to the module that
uses it.

Two kinds of reachability the tool cannot derive, which `knip.jsonc` therefore
states outright:

- the per-variant bundle entries, which `vite.config.ts` names through a
  template literal, so only the default variant is resolved for it;
- the parser shims, which reach a bundle only through `resolve.alias`.

Each is listed there with its reason. A finding that is a false positive is
fixed in that config, with the reason written down — never by ignoring the
report.

### `pnpm jscpd` — duplication stays within budget

`pnpm jscpd` looks for copy-paste across the three published packages. Unlike
an unused export, a clone is not automatically a defect: two methods that read
the same today may be answering to different requirements tomorrow, and pulling
them together couples them. So this is a budget, not a prohibition —
`.jscpd.json` fails the run above 1% duplicated lines. Four engine classes
delegating the same public methods to core bring the figure close to that line
on purpose: the budget is spent on those, and any new clone has to justify
itself against it.

It reads only what is published. The demo deliberately repeats itself: each
player page is a complete, standalone integration, which is the whole of its
value as an example, and factoring the shared half into a wrapper would make it
a worse one.

One clone stands, and is expected to: the engine classes' `addEventListener`
and `removeEventListener` are thin, separately documented delegations to core,
mirrored on purpose because they are public API.
