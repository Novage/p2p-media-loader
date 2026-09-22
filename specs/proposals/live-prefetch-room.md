# Room for peers on a live stream

**Status: proposal, not implemented.** Written to be picked up in a fresh
session. Everything below was measured on a real stream; the numbers are not
estimates.

## The symptom

Two browsers on one live HLS stream, same swarm, same rendition:

- First run: one peer fetched 47 segments over HTTP and served them to the
  other, which fetched 4 and took 36 over P2P. Per-peer P2P ratio 4 % and 90 %.
- Later run, same setup: both peers fetched nearly everything over HTTP, 1.68
  copies of each segment pulled from the origin, and **zero elections ran on
  either side**.

The complaint that started this was the lopsided ratio. The metric that
matters, though, is copies per segment: the first run was near-optimal (about
1.0) and the second was not (1.68). Per-peer ratio is presentation; origin
traffic is the product.

## Why it happens

The stream, verified by fetching the playlist:

```
#EXT-X-TARGETDURATION:5
#EXTINF:5.000 × 4        →  20 s window
```

The core derives the live delay from that window, in
`packages/p2p-media-loader-core/src/live-delay.ts`:

```
liveDelayFromWindow(20, 5) = max(5, min(20 − 5, 60)) = 15 s
```

Three numbers then collide:

| Quantity                           | Value | Source                                       |
| ---------------------------------- | ----- | -------------------------------------------- |
| Live window                        | 20 s  | the stream                                   |
| Live delay, playhead behind edge   | 15 s  | `liveDelayFromWindow`, window − 1 segment    |
| High-demand window                 | 15 s  | `core.ts` default `highDemandTimeWindow: 15` |
| Player forward buffer (hls.js)     | 15 s  | adapter sets it from `highDemandTimeWindow`  |
| **Room left for prefetch and P2P** | **0** |                                              |

Every segment between the playhead and the live edge is inside the high-demand
window. The high-demand branch of `processQueue` fetches such a segment over
HTTP at once — and cancels a P2P download in flight to do it — so by the time
the prefetch election walks the queue, every segment already has a loading
request and is skipped. That is why the election logged nothing at all.

Measured confirmation, from the browser console logs of the second run:

- HTTP started within 50 ms of the player asking for the segment: 26/26 on one
  side, 37/38 on the other. The segment is already high-demand on arrival.
- Distance from "player asks" to "segment evicted" (eviction fires once the
  playhead passes `endTime + highDemandTimeWindow`) gave a forward buffer of
  12.5 s and 15.3 s against a 15 s window: slack −2.5 s and +0.3 s.
- Skew between the two players' requests for the same segment: 0.31 s median.
  In the first run it was 1.54 s, which is why that run looked healthy — one
  peer ran a refresh ahead and acted as a cache. That was luck in the timing,
  not the design working.

## The invariant, and how each adapter breaks it

**The player's forward buffer must reach further than the high-demand window,
by more than a handoff costs** (peer skew + one HTTP fetch + one P2P transfer,
about 1.6 s on this stream). Today the buffer is at or inside the window in all
three adapters, on both protocols:

| Adapter | Forward buffer                                                           | Value | High-demand | Room     |
| ------- | ------------------------------------------------------------------------ | ----- | ----------- | -------- |
| hls.js  | `max(2 × segment, highDemandTimeWindow)` (`engine.ts:421`)               | 15 s  | 15 s        | 0        |
| dash.js | `max(2 × segment, min(highDemand, delay − 1 segment))` (`engine.ts:381`) | 10 s  | 15 s        | **−5 s** |
| Shaka   | not set at all; Shaka's own default buffering goal                       | ~10 s | 15 s        | **−5 s** |

So this is not an HLS quirk. On DASH it is worse: the player fetches less far
ahead than the core's urgent zone, so P2P cannot win a single segment.

## The proposed rule

Both numbers come from geometry the core already has — the segment duration and
the live delay:

```
playerBuffer = liveDelay − 1 segment          // stay off the live edge
highDemand   = min(configured, playerBuffer / 2)
```

The core calls the nearer half of what the player buffers urgent, and leaves
the farther half to peers.

| Stream             | Window | Segment | Delay       | Buffer       | High-demand       | Room  |
| ------------------ | ------ | ------- | ----------- | ------------ | ----------------- | ----- |
| The one above, HLS | 20 s   | 5 s     | 15 s        | 10 s         | 5 s               | 5 s   |
| Typical DASH live  | 300 s  | 4 s     | 60 s capped | 56 s         | 15 s ceiling      | 41 s  |
| Short segments     | 12 s   | 2 s     | 10 s        | 8 s          | 4 s               | 4 s   |
| VOD                | —      | —       | —           | player's own | configured (15 s) | large |

DASH comes out healthier than HLS because its window is usually minutes, so the
delay hits the 60 s cap and there is room to spare. A four-segment HLS playlist
is the tight case, and 5 s of room still covers the 1.6 s a handoff needs.

`highDemandTimeWindow` becomes optional in `StreamConfig`: `undefined` means
derive, a number means force. Leave `httpDownloadTimeWindow` and
`p2pDownloadTimeWindow` alone — at 3000 and 6000 they already mean "everything",
and on live the playlist bounds them.

## Work to do

1. **Core: derive the window.** `packages/p2p-media-loader-core/src/utils/stream.ts`
   `calculateTimeWindows` is where the effective windows are computed. It needs
   the stream's segment duration and live delay; both can be computed once per
   queue pass in `hybrid-loader.ts` rather than per segment.
2. **Core: expose the effective value.** Adapters currently read
   `config.mainStream.highDemandTimeWindow` directly and would read `undefined`.
   Give the core an accessor for the effective windows per stream type instead
   of letting four adapters re-derive it. Log the choice once per stream:
   window, segment, delay, derived high-demand. Without that line, the next
   report like this one is another archaeology session.
3. **Decouple storage retention.** `segment-memory-storage.ts` `isRetained`
   (around line 265) keeps live segments for `highDemandTimeWindow` _behind_
   the playhead. Shrinking the window to 5 s would shrink every peer's trailing
   cache to one segment, so a peer slightly behind another finds nothing to
   take. Retention should follow the live delay, or a couple of segments; it
   costs a few MB against a 4 GiB budget.
4. **hls.js adapter** (`src/engine.ts` around 413–440): size `maxBufferLength`
   and `maxMaxBufferLength` from the live delay, not from the high-demand
   window. Keep the "never lower than what the integrator set" behaviour.
5. **dash.js adapter** (`src/engine.ts` `forwardBufferSettings`, around 367–400):
   drop the `min(highDemandTimeWindow, …)` term and keep the live-edge margin.
   Buffering past the edge makes dash.js request segments the registry has not
   seen, which its own comment says drops P2P entirely — that margin is
   load-bearing.
6. **Shaka adapter**: set a buffering goal. It sets none today, and Shaka's
   default sits below the window. Apply it the way the delay is applied in
   `bound-player.ts` (`configure`, restore on release, integrator's own value
   wins).
7. **Specs**: `specs/player-adapters.md` (each adapter's buffer rule and the
   ordering invariant), `specs/playback-contract.md` (what the high-demand
   window now means), `specs/prefetch.md` (the room the election needs).
   `CHANGELOG.md` under 5.0.0.

## How to verify

Unit tests cover the derivation, but the claim is about two browsers, so
measure it.

1. `pnpm build`, then the demo dev server on `localhost:5173`, player `hlsjs_hls`,
   stream
   `https://hls-harbor-livepush.akamaized.net/live_cdn/nsqIStpj8PaG-Ev/emcQJ0pGpremocy/index.m3u8`.
2. Two tabs, both with
   `localStorage.debug = "p2pml-core:*"`, run for three minutes, export both
   consoles.
3. Report, before and after: **copies per segment** (the number that matters),
   both peers' P2P ratios, and how many elections ran.
4. Repeat on DASH with `dashjs` and `shaka` against a live MPD.

The analysis used on the logs so far, for reuse: count `request-main http …
started` and `request-main p2p … started` per side, take the union and the sum
of the HTTP sets for copies per segment, and derive the forward buffer from the
gap between `requests: (… | id)` and `Removed segment id` minus the high-demand
window.

## What not to repeat

An earlier attempt changed the backup deadline in `utils/election.ts` instead:
it subtracted one playlist refresh from `shouldFetchNow`, so a backup would not
step in before the owner had seen the segment. It was correct in isolation,
passed its tests, and **made the real stream worse** — 1.0 → 1.33 copies per
segment — because with zero room no deadline policy can fit a handoff. It was
reverted. Do not reopen it until the room exists; if backups then misbehave,
that measurement will be meaningful.

Note also that the allowance in `shouldFetchNow` is _added_ to the threshold, so
enlarging it makes a backup fire **earlier**, not later. That sign is easy to
get backwards.

## Open decisions

- `playerBuffer / 2` is a choice, not a derivation. One segment of room is the
  floor that matters; half is simply a memorable split. If a stream ever wants
  more urgency than room, the configured number overrides.
- Whether VOD should derive at all. The proposal leaves VOD on the configured
  15 s, since VOD players buffer deep and the horizon is the whole asset.
- Whether the effective windows belong in the public API or only in logs.
