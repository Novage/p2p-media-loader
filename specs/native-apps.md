# Native apps

The mobile library is a **separate project in its own repository**,
[P2P Media Loader Mobile](https://github.com/Novage/p2p-media-loader-mobile),
not part of this one. Its own specs describe it: `specs/scope.md` (platforms,
players, streams, and which requests get P2P), `specs/engine.md` (the JS
engine that runs the core) and `specs/api.md` (its public API). This spec only
summarizes the design, and records what it asks of the core, because a change
here can break it without a test here failing.

## Shape

A native app on Android or iOS plays through its platform player. The mobile
library runs **this repository's core, unchanged**, in an embedded JS engine,
QuickJS, inside the app's process. There is no WebView and no browser. The
engine supplies the browser APIs the core reads, from native code: timers and
`performance.now()` from the engine's loop, `fetch` and `WebSocket` over the
platform's network client, `RTCPeerConnection` over libdatachannel, and `URL`
over Ada, among others.

```
  Media3 / AVPlayer
        │  segment and manifest requests
        ▼
  mobile library ──────────►  QuickJS
  (data source, or            └── core (the published bundle, unchanged)
   a local HTTP server)            ├── fetch, WebSocket  → platform network
                                   └── RTCPeerConnection → libdatachannel → peers
```

A player's requests reach the library in one of two ways:

- **A data source** (Media3): the player sends every request through it, with
  the real URL and byte range, so every URL in a manifest gets P2P.
- **A local HTTP server** (AVPlayer, and any player that plays a URL): the app
  gives the player a local URL for the manifest. Only relative and
  root-relative URLs then reach the library; an absolute URL goes to the origin
  without P2P. The library does not rewrite manifests.

## Why mobile and browser peers share swarms

The engine runs the same core, so the manifest parse, `externalId` and
`streamId` are identical: a browser peer and a mobile peer are in the same
swarm by construction, not by two implementations agreeing on a
specification. This is the reason identity is derived from the manifest rather
than from a player ([segment-identity.md](segment-identity.md)). Measured in a
mixed swarm of Chrome and the core in Node, each segment came from the origin
1.001 times, with the same bytes on both sides.

## The three responsibilities

Each integration does what a browser adapter does
([player-adapters.md](player-adapters.md)), and no more:

- **Manifests and segments** pass through the data source or the local server
  to the core, which resolves each request through its registry, as in a
  browser.
- **Playback state** comes from the player, not from its requests: a player
  holding 30 seconds of buffer makes requests that look like those of one
  holding 2. The Media3 and AVPlayer integrations read the player and report
  `bufferAhead` and `rate`; for any other player, the app reports them through
  the library's API. An integration that never reports still plays: every
  request the store cannot serve is then urgent and goes over HTTP
  ([playback-contract.md](playback-contract.md)).
- **Player settings:** an integration that places a live player follows the
  rules of [player-adapters.md](player-adapters.md), "Settings an adapter
  writes", as the browser adapters do.

The player and the core run on different threads of the app, which is one
reason the playback contract carries no absolute position: `bufferAhead` is a
duration, so no clock or offset has to agree between them.

## What the design asks of the core

- **Only the host's globals.** The engine supplies the globals the core reads
  today, and no others: `engine.md`, "Globals", lists them. A browser API the
  core starts to read is missing there until the mobile library adds it, and
  the failure shows only in the app. `pnpm check:node` checks the published
  entries in Node, not against that list.
- **The published bundle.** The engine embeds the HLS bundle,
  `dist/p2p-media-loader-core-hls.es.js`, of an exact version that the mobile
  library pins ([packaging.md](packaging.md)). A change to the bundles' names,
  exports or format is a change for it.
- **Functions in the settings** — `swarmId`, `streamIdBuilder`,
  `segmentFilter`, `httpRequestSetup` and `validateP2PSegment` — may be the
  app's Kotlin functions, called across the engine's bridge. The core's
  contract for each, synchronous or not, is what the bridge implements.
- **No just-in-time compiler.** QuickJS interprets: the core's own work per
  segment and per timer stays small. The core with V8's optimizing compiler
  off used 1.6 % of one core while playing.
- **The same peer protocol.** Mobile peers are peers of the web version they
  run; the protocol rules of [segment-identity.md](segment-identity.md),
  "Version discipline", apply to them unchanged.

## What plays without P2P

As in a browser, a request the core does not recognise loads from the origin.
In addition, on mobile: a request to an absolute URL through the local server;
casting, since AirPlay and Chromecast receivers cannot reach the phone, so the
integration gives them the original URL; and keys and licences, which never go
through peers ([encryption.md](encryption.md)). When the app goes to the
background and the platform stops the engine's work, the player goes on over
HTTP.
