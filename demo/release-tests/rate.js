// Test 5, playback rate on VOD (specs/release-testing.md). For each engine:
// tab A at 2 and B at 1 for 60 s, both at 2 for 60 s, A at 1.5, 0.5 and 1
// for 20 s each, and a seek in A while it plays at 2. Each tab samples its
// own element every second: the rate it plays at, `waiting` events, and the
// buffer ahead of the playhead.

import {
  STREAMS as S,
  background,
  delta,
  inAll,
  load,
  settle,
  sleep,
  video,
} from "./lib.js";

/* global window, performance */

function ahead(v) {
  const t = v.currentTime;
  const b = v.buffered;
  for (let i = 0; i < b.length; i++) {
    if (b.start(i) <= t + 0.15 && b.end(i) >= t) return b.end(i) - t;
  }
  return 0;
}

/** Sets this tab's rate and starts a sampler of its own for the phase. */
export function startPhase(rate) {
  const v = video();
  if (rate != null) v.playbackRate = rate;
  clearInterval(window.__rateTimer);
  const P = {
    me: window.__me,
    rate: v.playbackRate,
    t0: performance.now(),
    m0: v.currentTime,
    waiting: 0,
    minAhead: Infinity,
    rates: new Set(),
    counters: window.__p2pmlDiagnostics?.snapshot().counters ?? {},
  };
  window.__rateP = P;
  if (v !== window.__rateVideo) {
    window.__rateVideo = v;
    v.addEventListener(
      "waiting",
      () => window.__rateP && window.__rateP.waiting++,
    );
  }
  window.__rateTimer = setInterval(() => {
    P.minAhead = Math.min(P.minAhead, ahead(v));
    P.rates.add(v.playbackRate);
  }, 1000);
  return { me: P.me, rate: P.rate };
}

/** The phase's result in this tab. */
export function endPhase() {
  const P = window.__rateP;
  const v = video();
  const wall = (performance.now() - P.t0) / 1000;
  const media = v.currentTime - P.m0;
  const d = delta(window.__p2pmlDiagnostics?.snapshot().counters, P.counters);
  return {
    me: P.me,
    rate: P.rate,
    rates: [...P.rates],
    speed: +(media / wall).toFixed(2),
    waiting: P.waiting,
    minAhead: +P.minAhead.toFixed(1),
    rs: v.readyState,
    err: v.error?.code ?? null,
    http: d["Download:http:succeed"] ?? 0,
    p2p: d["Download:p2p:succeed"] ?? 0,
    failures: Object.fromEntries(
      Object.entries(d).filter(([k]) => /fail|Miss/i.test(k)),
    ),
    frames: (() => {
      const q = v.getVideoPlaybackQuality?.();
      return q ? [q.droppedVideoFrames, q.totalVideoFrames] : null;
    })(),
    anomalies: window.__p2pmlDiagnostics?.snapshot().anomalies.length ?? 0,
  };
}

export function defaultSteps() {
  return [
    { p: "hlsjs_hls", u: S.MUX },
    { p: "dashjs", u: S.BBB },
    { p: "shaka", u: S.BBB },
    { p: "videojs10_hls", u: S.MUX },
  ];
}

export function run({
  steps = defaultSteps(),
  count = 2,
  long = 60000,
  short = 20000,
  name = "rate",
  tag = `r${Date.now() % 100000}`,
} = {}) {
  return background(name, async (log) => {
    const phaseAll = async (label, rates, ms) => {
      await inAll(count, "startPhase", [rates.rest], "rate.js");
      if (rates.a != null) startPhase(rates.a);
      await sleep(ms);
      return { label, tabs: await inAll(count, "endPhase", [], "rate.js") };
    };
    for (let i = 0; i < steps.length; i++) {
      const { p, u } = steps[i];
      await load(count, { player: p, streamUrl: u, swarmId: `rt-${tag}-${i}` });
      const settledMs = await settle(count, 40000);
      await sleep(5000);
      const phases = [];
      phases.push(await phaseAll("A 2, B 1", { a: 2, rest: 1 }, long));
      phases.push(await phaseAll("both 2", { rest: 2 }, long));
      phases.push(await phaseAll("A 1.5", { a: 1.5, rest: 1 }, short));
      phases.push(await phaseAll("A 0.5", { a: 0.5, rest: 1 }, short));
      phases.push(await phaseAll("A 1", { a: 1, rest: 1 }, short));
      // a seek in A at 2, 20% further on
      await inAll(count, "startPhase", [1], "rate.js");
      startPhase(2);
      const v = video();
      const target = v.currentTime + v.duration * 0.2;
      const t0 = performance.now();
      v.currentTime = target;
      let seekMs = null;
      while (performance.now() - t0 < 15000) {
        if (!v.seeking && v.readyState >= 3) {
          seekMs = Math.round(performance.now() - t0);
          break;
        }
        await sleep(50);
      }
      await sleep(10000);
      phases.push({
        label: "seek at 2",
        seekMs,
        tabs: await inAll(count, "endPhase", [], "rate.js"),
      });
      await inAll(count, "startPhase", [1], "rate.js");
      log({ i, p, settledMs, phases });
    }
    return "done";
  });
}

/** One line per phase. */
export function summarize(entries) {
  return entries.map((e) => ({
    step: `${e.i} ${e.p} settled=${e.settledMs}`,
    phases: e.phases.map(
      (ph) =>
        `${ph.label}${ph.seekMs != null ? ` seek${ph.seekMs}ms` : ""}: ` +
        ph.tabs
          .map(
            (t) =>
              `r${t.rate}${t.rates.length > 1 ? JSON.stringify(t.rates) : ""} x${t.speed} w${t.waiting} min${t.minAhead} rs${t.rs} e${t.err} http${t.http}/p2p${t.p2p} f${JSON.stringify(t.failures)} an${t.anomalies}`,
          )
          .join(" | "),
    ),
  }));
}
