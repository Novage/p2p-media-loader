// Test 7, simultaneous joins (specs/release-testing.md). Moves every tab into
// a new swarm at the same moment, `rounds` times, alternating engines, and
// measures how long until every tab holds a peer. Glare lines are counted
// when the page loaded with `p2pml-core:tracker` in `localStorage.debug`.

import { STREAMS as S, background, inAll, sleep } from "./lib.js";

/* global window, performance */

const ENGINES = [
  ["hlsjs_hls", S.MUX],
  ["dashjs", S.BBB],
  ["shaka", S.BBB],
  ["videojs", S.MUX],
];

export function heldNow() {
  const s = window.__p2pmlDiagnostics?.snapshot();
  const held = Object.entries(s?.probes ?? {})
    .filter(([k]) => k.startsWith("PeersHeld"))
    .map(([, n]) => n);
  const glare = (window.__U?.glare ?? []).length;
  return {
    me: window.__me,
    held,
    glare,
    rs: document.querySelector("video")?.readyState,
  };
}

/** Adds glare lines of the tracker logger to the probe. */
export async function watchGlare() {
  const url = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .find((n) => /\/deps\/debug\.js/.test(n));
  const debug = (await import(url)).default;
  if (window.__glareHook) return "already";
  window.__glareHook = true;
  window.__U.glare = [];
  const previous = debug.log;
  debug.log = function (...args) {
    if (typeof args[0] === "string" && args[0].includes("glare")) {
      window.__U.glare.push(args[0].replace(/%c/g, "").slice(0, 200));
    }
    return previous.apply(this, args);
  };
  return "watching";
}

export function run({
  count = 2,
  rounds = 16,
  limitMs = 15000,
  name = "joins",
  tag = `j${Date.now() % 100000}`,
} = {}) {
  return background(name, async (log) => {
    await inAll(count, "watchGlare", [], "joins.js");
    for (let k = 0; k < rounds; k++) {
      const [player, streamUrl] = ENGINES[k % ENGINES.length];
      const glareBefore = await inAll(count, "heldNow", [], "joins.js");
      // one message, so every tab changes swarm at the same moment
      const t0 = performance.now();
      await inAll(count, "go", [
        { player, streamUrl, swarmId: `rt-${tag}-${k}` },
      ]);
      await sleep(4000);
      await inAll(count, "play");
      let peerMs = null;
      let last;
      while (performance.now() - t0 < limitMs) {
        last = await inAll(count, "heldNow", [], "joins.js");
        if (
          last.length === count &&
          last.every((r) => r.held.some((n) => n > 0))
        ) {
          peerMs = Math.round(performance.now() - t0);
          break;
        }
        await sleep(500);
      }
      log({
        k,
        player,
        peerMs,
        held: last?.map((r) => r.held),
        glare: last?.map(
          (r) => r.glare - (glareBefore.find((b) => b.me === r.me)?.glare ?? 0),
        ),
      });
    }
    return "done";
  });
}
