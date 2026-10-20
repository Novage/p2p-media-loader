// Test 4, seeks on VOD (specs/release-testing.md). Needs the temporary demo
// edit of test 12 (`p2p=0`), as config.js does. For each engine and stream:
// step 1 with P2P (both tabs in a new swarm, B paused after 10 s), step 2
// with P2P disabled in A alone at positions moved by 2%, and step 3 with P2P
// and no peer at positions moved by 4% where step 1 was slower. Then two more
// loads in each mode, in turns, for the load medians.

import {
  STREAMS as S,
  HLS_ENGINES,
  DASH_ENGINES,
  background,
  go,
  inAll,
  inOthers,
  median,
  play,
  sleep,
  until,
  video,
} from "./lib.js";

/* global window, performance */

export const PLAN = [
  0.3, 0.27, 0.32, 0.1, 0.3, 0.6, 0.57, 0.12, 0.9, 0.4, 0.95, 0.45,
];
export const WAITS = [2, 3, 1.5, 4, 2.5, 3.5, 2, 1.5, 4, 3, 2, 2.5];

/** Every engine on every VOD stream it plays. */
export function defaultSteps() {
  const steps = [];
  for (const p of HLS_ENGINES) steps.push({ p, u: S.MUX });
  for (const u of [S.BBB, S.ANGEL, S.NETFLIX]) {
    for (const p of DASH_ENGINES) {
      // Video.js 8 plays neither SegmentBase stream (verification.md).
      if (p === "videojs" && u !== S.BBB) continue;
      steps.push({ p, u });
    }
  }
  return steps;
}

const inBuffer = (v, t) => {
  for (let i = 0; i < v.buffered.length; i++) {
    if (v.buffered.start(i) <= t && v.buffered.end(i) > t + 0.5) return true;
  }
  return false;
};

/**
 * Changes this tab's source and resolves with the ms until its video reaches
 * readyState 3, or null after 20 s.
 */
export async function loadHere(params) {
  const old = video();
  let low = false;
  go(params);
  return until(() => {
    const v = video();
    if (!v || (v === old && !low)) {
      if (v && v.readyState < 3) low = true;
      return false;
    }
    if (v.readyState < 3) low = true;
    return low && v.readyState >= 3;
  }, 20000);
}

export function pause() {
  video()?.pause();
  return true;
}

/** One seek: its time, whether the target was buffered, the first requests. */
async function seek(fraction, wait) {
  const v = video();
  const U = window.__U;
  const target = fraction * v.duration;
  const buffered = inBuffer(v, target);
  const from = +v.currentTime.toFixed(1);
  const n = U.urg.length;
  const t0 = performance.now();
  v.currentTime = target;
  await sleep(30);
  const ms = await until(() => !v.seeking && v.readyState >= 3, 15000, 20);
  const requests = U.urg
    .slice(n, n + 3)
    .map((x) => `${x.u ? "U" : "n"}+${Math.round(x.at - t0)} ${x.seg}`);
  await sleep(wait * 1000);
  return {
    f: fraction,
    from,
    to: +target.toFixed(1),
    buffered,
    ms: ms == null ? null : ms + 30,
    requests,
  };
}

async function seeks(shift) {
  const out = [];
  for (let k = 0; k < PLAN.length; k++) {
    out.push(await seek(Math.min(PLAN[k] + shift, 0.97), WAITS[k]));
  }
  return out;
}

const counters = () => window.__p2pmlDiagnostics?.snapshot().counters ?? {};

function summary(list, c0) {
  const c = counters();
  const d = (k) => (c[k] ?? 0) - (c0[k] ?? 0);
  return {
    median: median(list.filter((x) => !x.buffered).map((x) => x.ms)),
    max: Math.max(...list.map((x) => x.ms ?? 15000)),
    over5: list.filter((x) => (x.ms ?? 15000) > 5000).length,
    timeouts: list.filter((x) => x.ms == null).length,
    p2p: d("Download:p2p:succeed"),
    http: d("Download:http:succeed"),
    anomalies: window.__p2pmlDiagnostics?.snapshot().anomalies.length ?? 0,
  };
}

export function run({
  steps = defaultSteps(),
  count = 2,
  name = "seeks",
  tag = `s${Date.now() % 100000}`,
} = {}) {
  return background(name, async (log) => {
    for (let i = 0; i < steps.length; i++) {
      const { p, u } = steps[i];
      const base = { player: p, streamUrl: u };
      const sw = (k) => `rt-${tag}-${i}-${k}`;
      const loads = { p2p: [], off: [] };
      const result = { i, p, u: u.split("/").slice(-2).join("/") };

      // Step 1: with P2P, B paused after 10 s of play.
      window.__U && (window.__U.urg.length = 0);
      await inOthers(count, "go", [{ ...base, swarmId: sw(1) }]);
      loads.p2p.push(await loadHere({ ...base, swarmId: sw(1) }));
      await inAll(count, "play");
      await sleep(10000);
      await inOthers(count, "pause", [], "seeks.js");
      let c0 = counters();
      const s1 = await seeks(0);
      result.step1 = { seeks: s1, ...summary(s1, c0) };

      // Step 2: P2P disabled, A alone; B moves away and stays paused.
      await inOthers(count, "go", [{ ...base, swarmId: sw(9), p2p: "0" }]);
      await sleep(3000);
      await inOthers(count, "pause", [], "seeks.js");
      loads.off.push(await loadHere({ ...base, swarmId: sw(2), p2p: "0" }));
      await play();
      await sleep(10000);
      c0 = counters();
      const s2 = await seeks(0.02);
      result.step2 = { seeks: s2, ...summary(s2, c0) };

      // Step 3: P2P with no peer, where step 1 was slower.
      if (
        result.step1.median != null &&
        result.step2.median != null &&
        result.step1.median - result.step2.median > 300
      ) {
        await loadHere({ ...base, swarmId: sw(3) });
        await play();
        await sleep(10000);
        c0 = counters();
        const s3 = await seeks(0.04);
        result.step3 = { seeks: s3, ...summary(s3, c0) };
      }

      // Two more loads in each mode, in turns, each in a new swarm.
      for (let k = 0; k < 2; k++) {
        loads.p2p.push(await loadHere({ ...base, swarmId: sw(`l${k}`) }));
        loads.off.push(
          await loadHere({ ...base, swarmId: sw(`o${k}`), p2p: "0" }),
        );
      }
      result.loads = {
        ...loads,
        p2pMedian: median(loads.p2p),
        offMedian: median(loads.off),
      };
      log(result);
    }
    go({ p2p: "", player: "hlsjs_hls" });
    return "done";
  });
}

/** One line per step and mode. */
export function summarize(entries) {
  const line = (s) =>
    s
      ? `med${s.median} max${s.max} >5s:${s.over5} t/o:${s.timeouts} http${s.http}/p2p${s.p2p} an${s.anomalies}`
      : "-";
  return entries.map((e) => ({
    step: `${e.i} ${e.p} ${e.u}`,
    loads: `p2p ${JSON.stringify(e.loads.p2p)} med${e.loads.p2pMedian} | off ${JSON.stringify(e.loads.off)} med${e.loads.offMedian}`,
    s1: line(e.step1),
    s2: line(e.step2),
    s3: line(e.step3),
  }));
}
