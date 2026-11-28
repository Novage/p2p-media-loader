// Test 9, player and source lifecycle (specs/release-testing.md). Changes the
// stream or player `changes` times, less than 2 s apart, in every tab at
// once, so that segment requests are open at each change; then loads the
// last stream and measures how soon every tab plays and holds a peer, what
// it shares, and what is left open. The tracker log
// (`p2pml-core:tracker`) gives the first `connected to` line.

import {
  STREAMS as S,
  background,
  inAll,
  load,
  settle,
  sleep,
  stepRows,
} from "./lib.js";

/* global window, performance */

const SEQUENCE = [
  ["hlsjs_hls", S.MUX],
  ["dashjs", S.BBB],
  ["shaka", S.HLS_LIVE],
  ["videojs10_hls", S.MUX],
  ["hlsjs_hls", S.DVR],
  ["shaka", S.BBB],
  ["dashjs", S.TP2],
  ["videojs", S.MUX],
  ["videojs10_dashjs", S.BBB],
  ["hlsjs_hls", S.HLS_LIVE],
];

/** The open records of this tab, counted by kind. */
export function openKinds() {
  const s = window.__p2pmlDiagnostics?.snapshot();
  const kinds = {};
  for (const t of s?.open ?? []) {
    const k = t.split(/[#\s]/)[0];
    kinds[k] = (kinds[k] ?? 0) + 1;
  }
  return { me: window.__me, kinds };
}

export function run({
  count = 2,
  changes = 20,
  last = ["hlsjs_hls", S.HLS_LIVE],
  name = "lifecycle",
  tag = `l${Date.now() % 100000}`,
} = {}) {
  return background(name, async (log) => {
    // a steady state first, so that its records count as the step before
    await load(count, {
      player: last[0],
      streamUrl: last[1],
      swarmId: `rt-${tag}-base`,
    });
    log({ baseSettledMs: await settle(count, 40000) });
    await sleep(10000);
    log({ baseOpen: await inAll(count, "openKinds", [], "lifecycle.js") });
    await inAll(count, "resetProbe");
    const before = await inAll(count, "state");
    const gaps = [];
    for (let k = 0; k < changes; k++) {
      const [player, streamUrl] = SEQUENCE[k % SEQUENCE.length];
      await inAll(count, "go", [
        { player, streamUrl, swarmId: `rt-${tag}-${k}` },
      ]);
      const gap = 600 + Math.round(Math.random() * 1200);
      gaps.push(gap);
      await sleep(gap);
    }
    const t0 = performance.now();
    await inAll(count, "go", [
      { player: last[0], streamUrl: last[1], swarmId: `rt-${tag}-last` },
    ]);
    await sleep(4000);
    await inAll(count, "play");
    const settledMs = await settle(count, 120000);
    const peerMs = settledMs == null ? null : settledMs + 4000;
    await sleep(25000);
    const after = await inAll(count, "readTab");
    log({
      gaps,
      sinceLastChange: Math.round(performance.now() - t0),
      peerMs,
      rows: stepRows(
        after,
        before,
        Object.fromEntries(after.map((a) => [a.me, { probe: a.probe }])),
      ),
      open: await inAll(count, "openKinds", [], "lifecycle.js"),
    });
    return "done";
  });
}
