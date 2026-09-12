# Native players via a local proxy

The proxy described here is a **separate project in its own repository**, not
part of this one. This spec records the architecture because it constrains the
design of core — most visibly the playback contract, which carries no absolute
position precisely because the player and core sit in different processes here.

## Shape

Native applications on Android and iOS play through their platform player —
ExoPlayer and AVPlayer — pointed at a local HTTP proxy instead of the origin.
The proxy hosts core inside a WebView.

```
  ExoPlayer / AVPlayer
        │  HTTP to 127.0.0.1
        ▼
  local HTTP proxy  ──────────►  WebView
        │                         └── core (the same JavaScript as the browser)
        │                              └── WebRTC data channels to peers
        ▼
      origin / CDN
```

A WebView is used because it provides WebRTC natively. No platform WebRTC
library is bundled, and the P2P implementation is shared verbatim with the
browser.

## Why this makes cross-platform swarms possible

Mobile clients run **the same core**. The manifest parse is identical, so
`externalId` and `identityHash` are identical, so a browser peer and a mobile
peer are in the same swarm by construction — not by two implementations agreeing
on a specification.

This is the reason identity is derived from the manifest rather than from a
player. See [segment-identity.md](segment-identity.md).

## Mapping the three responsibilities

**Manifests.** The proxy must rewrite manifest URLs to point at itself, or the
player fetches segments straight from the CDN and bypasses P2P. That rewrite
requires parsing the manifest, which is the same parse that builds the registry
— one pass serves both.

**Segments.** The proxy resolves each request through core, exactly as a browser
adapter's loader hook does. It must be a fully range-capable HTTP server:
AVPlayer issues `Range` requests routinely, including small probe reads before a
real fetch, so arbitrary sub-ranges must be servable out of a cached whole
segment.

**Playback state.** _The proxy cannot supply this._ It sees requests leave the
player, never when the player consumes them, and a player holding 30 seconds of
buffer issues requests indistinguishable from one holding 2 seconds. A thin
native shim around the player reports it instead:

|               | ExoPlayer                                        | AVPlayer                                                          |
| ------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| `bufferAhead` | `getTotalBufferedDuration()` — already the value | `loadedTimeRanges` + `currentTime()`, via core's `getBufferAhead` |
| `rate`        | `playbackParameters.speed`, 0 when not playing   | `rate`                                                            |

Polled on a short interval and posted into the WebView.

An integration that declines to wrap the player still functions: core falls back
to inferring playback state from the request pattern, with the limits described
in [playback-contract.md](playback-contract.md).

CMCD does not remove the need for the shim on either platform, despite reaching
the proxy in every transmission mode. AVPlayer does not emit it. ExoPlayer does,
and reports `bl` as the overall buffered duration from the playhead — a closer
match to the contract than browser players manage — but only once the
application has passed a `CmcdConfiguration.Factory`, which means editing how it
builds its media source. Any integration willing to do that is better served by
the shim: it is continuous rather than one sample per request, and it knows when
playback is paused, which CMCD structurally cannot. CMCD is worth reading when a
host application happens to have already enabled it; it is not a path to a
shim-free integration.

## Constraints of the environment

**Bridge bandwidth.** Segment bytes crossing the native/JavaScript boundary is
the dominant performance concern. Base64 through `evaluateJavascript` inflates
payloads by a third and parses on the main thread. Bytes cross as binary — a
localhost WebSocket or a custom scheme handler.

**Two copies of the data.** The WebView holds segments in order to seed peers;
the player holds its own buffer. This is a real memory cost on constrained
devices and is budgeted for explicitly.

**WebView lifecycle.** iOS suspends WebView timers and peer connections when the
application backgrounds, and may discard the WebView under memory pressure;
Android throttles background WebViews. Background audio playback is ordinary
usage, so P2P going dormant is an expected state, and HTTP must take over
without interrupting playback. A discarded WebView is re-created and core
re-initialised from the manifest.

**AirPlay and Chromecast.** Both hand a _URL_ to the receiving device, which
cannot reach a proxy on the sender's loopback interface. These are detected and
the origin URL is used, without P2P.

**App Transport Security.** iOS requires a local-networking exception to permit
plain HTTP to the proxy.
