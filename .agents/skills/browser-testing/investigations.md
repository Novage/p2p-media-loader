# Short checks and investigations

What a check outside a release run needs: after a change, before a commit, or
to find the cause of one failure. The rules of [SKILL.md](SKILL.md) apply:
two tabs, a swarm of the check's own, visible pages, faults from
`demo/release-tests/faults.js`, nothing left behind.

## A two-peer live measurement

How many copies of each segment the two peers took from the origin, and
whether the election ran.

- Use the tight HLS live stream of
  [verification.md](../../../specs/verification.md) (four 5 s segments): it
  leaves the least room, so a regression shows first.
- Count HTTP downloads per segment over both tabs, from the hybrid loader's
  log (`p2pml-core:hybrid-loader-main`) or the ledger's download counters, and
  the "as owner" and "as backup #n" lines. Two peers that share well take
  about 1.2 copies of each segment; one that never elects takes close to 2.
- **Split the sample by rendition before judging it.** Each rendition is a
  swarm with its own `main-<hash>` identity in the logs. An engine's ABR that
  moves one peer to another rendition for a while makes duplicates that are
  not an election fault. Count only the segments where both peers were in one
  swarm.

## Pinning a rendition, and a player's internals

- **HLS.js and dash.js** in the demo: use the demo's quality selector, from
  the driver: set the `<select>` whose options name the rendition, and
  dispatch `change`.
- **Shaka** in the demo has no selector, and the demo keeps the player object
  private. Import the demo's own Shaka module by the URL the page loaded
  (`performance.getEntriesByType("resource")`, the entry that ends in
  `shaka-import.ts`), so the module is the same instance. Then wrap each
  function on `shaka.Player.prototype` so that the next call stores `this` on
  `window`. Pin with `configure({ abr: { enabled: false } })` and
  `selectVariantTrack(track, true)`.
- Remove such wrappers when the check ends: reload the tab.

## Faults on a single request

`faults.js` covers 404, 503, no answer, a slow network and the trackers. For
a fault it does not have yet, add it there, not in the page. Two that a check
of resumed downloads needs:

- **A body cut short**: answer `200` with the real `Content-Length` and half
  the body. The next attempt must go on from the bytes held, with a `Range`
  request or from a peer.
- **Only a segment's first request**: skip requests that carry a `Range`
  header, so the fault does not hit the resume it is meant to test.

Every wrapper honours the request's abort signal, or an aborted request
cannot be cancelled. Record each `Range` header the page sends: it shows
whether a resume went to HTTP or to a peer. A fault on an attempt that the
core then stopped (to give an urgent request the link) tested nothing; inject
it again.

## A control without P2P

Before calling a playback error ours, run the same player, the same stream
and the same browser without P2P Media Loader.

- In the demo, the temporary edit of release test 12 disables P2P; undo it by
  hand afterwards.
- For an IIFE page, copy it to an untracked page beside it without the
  engine's script and calls. Log each segment and rendition change from the
  player itself (Shaka: `registerResponseFilter`, `adaptation` and
  `variantchanged` events; the video element's `error`). Put the copy in
  `demo/dist/modules-demo/` too when the person uses `vite preview`. Delete
  both when the check ends.
- If the control fails the same way, the cause is the player or the browser.
  If it plays, compare what each page loaded: files, sizes, renditions, and
  `http` or `p2p`.
- Make the control reproduce the conditions of the failure. The engine
  reports the core's bandwidth, so the player can switch renditions at a
  different moment than it does alone; give the control options that pin a
  rendition, or switch to one after a delay.

## Old browsers and the IIFE pages

`demo/public/modules-demo/` holds a page per IIFE bundle: `hlsjs-iife.html`,
`shaka-iife.html` and `dashjs-iife.html`. The other pages there use the ESM
bundles, which a browser without ES modules cannot load.

- The bundle folders there (`core`, `hlsjs`, `shaka`, `dashjs`, `videojs`) are
  symlinks to `packages/*/dist`. Build the bundle first: `pnpm build`, or one
  package's `pnpm build:iife` and `pnpm build:iife-min`. The dev server then
  serves it at once; `vite preview` serves the copy of the last demo build.
- To check that a server has the latest bundle, compare a checksum of the
  served file with the one in `dist`, and search the served file for a string
  only the latest commit added.
- A page must parse in ES2015: no `async`/`await`, and no trailing commas in
  argument lists (the demo's prettier config keeps them out of
  `*-iife.html`).
- Chromium 49 is the oldest target. It has `fetch` and readable response
  bodies, but no `AbortController` and no `navigator.connection`, so players
  start at a lower bandwidth estimate than in a current browser.
- Shaka 5 on Chromium 49 fails with a decode error (Shaka error 3016) when its
  ABR switches the MPEG-TS mux stream between renditions at start, with P2P or
  without it. Judge an old browser's P2P on a stream that does not need TS
  conversion, or with the rendition pinned.

## Browser tool notes

- A JavaScript call in the page times out after about 45 s: poll a longer
  check in calls of 40 s or less.
- The network request list is crowded out by Vite's module requests on the
  dev server. Read media requests from
  `performance.getEntriesByType("resource")`, or count them in a fault
  wrapper.
