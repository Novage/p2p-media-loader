// Test 2, stream matrix (specs/release-testing.md). Each step loads one
// engine and stream in every tab, in a swarm of its own, waits until every
// tab plays and holds a peer, then measures `holdMs` of steady play.

import {
  STREAMS as S,
  HLS_ENGINES,
  DASH_ENGINES,
  background,
  inAll,
  load,
  settle,
  sleep,
  stepRows,
} from "./lib.js";

/** The full matrix: every stream of verification.md on every engine for it. */
export function fullSteps() {
  const hls = [S.MUX, S.HLS_LIVE, S.DVR];
  const dash = [S.BBB, S.ANGEL, S.NETFLIX, S.TP8, S.TP2, S.SEGTL];
  const steps = [];
  for (const u of hls) for (const p of HLS_ENGINES) steps.push({ p, u });
  for (const u of dash) {
    for (const p of DASH_ENGINES) {
      // Video.js 8 plays neither SegmentBase stream (verification.md).
      if (p === "videojs" && (u === S.ANGEL || u === S.NETFLIX)) continue;
      steps.push({ p, u });
    }
  }
  return steps;
}

/** A short run: one VOD and one live stream of each protocol, every engine. */
export function smokeSteps() {
  const steps = [];
  for (const u of [S.MUX, S.HLS_LIVE])
    for (const p of HLS_ENGINES) steps.push({ p, u });
  for (const u of [S.BBB, S.TP8])
    for (const p of DASH_ENGINES) steps.push({ p, u });
  return steps;
}

/**
 * Runs `steps` in `count` tabs; results under `name`. Pass rules: every tab at
 * readyState 4 with no error, holds a peer, gets segments over P2P, no
 * registry miss (WebM renditions excepted), nothing of the step before left
 * open, no anomaly, no console error.
 */
export function run({
  steps = smokeSteps(),
  count = 2,
  holdMs = 25000,
  name = "matrix",
  tag = `m${Date.now() % 100000}`,
} = {}) {
  return background(name, async (log) => {
    for (let i = 0; i < steps.length; i++) {
      const { p, u } = steps[i];
      const before = await inAll(count, "state");
      await load(count, { player: p, streamUrl: u, swarmId: `rt-${tag}-${i}` });
      const settledMs = await settle(count, 40000);
      await sleep(holdMs);
      const after = await inAll(count, "readTab");
      const extra = Object.fromEntries(
        after.map((a) => [a.me, { probe: a.probe, frames: a.frames }]),
      );
      log({
        i,
        p,
        u: u.split("/").slice(-2).join("/"),
        settledMs,
        rows: stepRows(after, before, extra),
      });
    }
    return "done";
  });
}

/** One line per tab and step, for reading results quickly. */
export function summarize(entries) {
  return entries.map((e) => ({
    step: `${e.i} ${e.p} ${e.u} settled=${e.settledMs}`,
    tabs: e.rows.map(
      (r) =>
        `rs${r.rs} e${r.err} lag${r.lag} held${JSON.stringify(r.held)} http${r.http}/p2p${r.p2p} ` +
        `fail${JSON.stringify(r.failures)} leak${r.leaked.length} an${r.anomalies.length} ` +
        `urg${r.probe?.urgent}/${r.probe?.requests} urgWithBuf${r.probe?.urgentWithBuffer} ` +
        `miss${r.probe?.misses} err${r.probe?.errors}${r.probe?.errors ? ":" + r.probe.errorSample.join(" / ") : ""}`,
    ),
  }));
}
