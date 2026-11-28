// Test 8, three to five peers (specs/release-testing.md). The tabs are opened
// and closed by whoever drives the browser; this module measures. Load the
// first tabs with `start`, take `mark` before each event (a late tab, a tab
// closed while it uploads, a tab reopened) and `since` after it.
//
// "Each segment over HTTP about once": the tabs' HTTP downloads together,
// divided by the most segments one tab downloaded. About 1 is the election
// working; about the tab count is every tab on its own. No ledger record
// marks an upload, so "a tab closed while it uploads" is confirmed only by a
// `Download:p2p:failed` or `aborted` in another tab.

import { delta, inAll, load, sleep, state } from "./lib.js";

/* global window, document */

/** Counts `waiting` events of this tab's video from now on. */
export function watchStalls() {
  const v = document.querySelector("video");
  if (v && !v.__stallWatch) {
    v.__stallWatch = true;
    v.addEventListener("waiting", () => {
      window.__stalls = (window.__stalls || 0) + 1;
    });
  }
  window.__stalls ??= 0;
  return true;
}

export function peerState() {
  return { ...state(), stalls: window.__stalls || 0 };
}

/** Loads `count` tabs into one swarm, plays, and starts counting stalls. */
export async function start(count, params) {
  await load(count, params);
  await sleep(3000);
  await inAll(count, "watchStalls", [], "peers.js");
  return inAll(count, "peerState", [], "peers.js");
}

/** A snapshot of every tab, to measure an event from. */
export function mark(count) {
  return inAll(count, "peerState", [], "peers.js");
}

/** Per tab and in total: what happened since `before`. */
export async function since(count, before) {
  const after = await inAll(count, "peerState", [], "peers.js");
  const rows = after.map((a) => {
    const b = before.find((x) => x.me === a.me);
    const d = delta(a.counters, b?.counters);
    return {
      me: a.me,
      new: !b,
      rs: a.rs,
      err: a.err,
      lag: a.lag,
      stalls: a.stalls - (b?.stalls ?? 0),
      held: a.held,
      http: d["Download:http:succeed"] ?? 0,
      p2p: d["Download:p2p:succeed"] ?? 0,
      requests: d["PlayerRequest:succeed"] ?? 0,
      other: Object.fromEntries(
        Object.entries(d).filter(
          ([k]) =>
            !/^(Download:(http|p2p):succeed|PlayerRequest:succeed|ManifestParse:succeed|Evicted|SegmentRequest:(not-)?urgent$|TrackerAnnounce:(sized|offers-capped))/.test(
              k,
            ),
        ),
      ),
      anomalies: a.anomalies,
    };
  });
  // Per segment one tab holds, not per segment its player asked for: on VOD
  // the core prefetches far past the player's requests, over HTTP and P2P.
  const http = rows.reduce((s, r) => s + r.http, 0);
  const perTab = Math.max(0, ...rows.map((r) => r.http + r.p2p));
  return {
    rows,
    httpPerSegment: perTab ? +(http / perTab).toFixed(2) : null,
  };
}

/** One line per tab, for reading quickly. */
export function summarize(result) {
  return {
    httpPerSegment: result.httpPerSegment,
    tabs: result.rows.map(
      (r) =>
        `${r.me}${r.new ? " (new)" : ""} rs${r.rs} e${r.err} lag${r.lag} stalls${r.stalls} held${JSON.stringify(r.held)} ` +
        `req${r.requests} http${r.http}/p2p${r.p2p} ${JSON.stringify(r.other)} an${r.anomalies.length}`,
    ),
  };
}
