// Test 3, pause (specs/release-testing.md). Each step plays a stream in every
// tab for 20 s, pauses this tab (A) for 40 s while the others play, then
// plays A for 15 s more. On a DVR stream A seeks to the middle of the window
// first, and must stay where it chose. Storage is sampled during the pause.

import {
  STREAMS as S,
  background,
  inAll,
  load,
  settle,
  sleep,
  state,
  stepRows,
  video,
} from "./lib.js";

/* global window */

/** One step per engine and stream type: live, DVR and VOD. */
export function defaultSteps() {
  return [
    { p: "hlsjs_hls", u: S.HLS_LIVE, kind: "live" },
    { p: "hlsjs_hls", u: S.DVR, kind: "dvr" },
    { p: "hlsjs_hls", u: S.MUX, kind: "vod" },
    { p: "dashjs", u: S.TP2, kind: "live" },
    { p: "dashjs", u: S.BBB, kind: "vod" },
    { p: "shaka", u: S.HLS_LIVE, kind: "live" },
    { p: "shaka", u: S.DVR, kind: "dvr" },
    { p: "videojs10_hls", u: S.HLS_LIVE, kind: "live" },
    { p: "videojs", u: S.MUX, kind: "vod" },
  ];
}

/** Counts `waiting` events of this tab's video from now on. */
export function watchWaiting() {
  const v = video();
  window.__waiting = 0;
  if (v && v !== window.__waitingVideo) {
    window.__waitingVideo = v;
    v.addEventListener(
      "waiting",
      () => (window.__waiting = (window.__waiting || 0) + 1),
    );
  }
  return true;
}

export const waiting = () => ({ me: window.__me, n: window.__waiting || 0 });

function seekToMiddle() {
  const v = video();
  const sk = v.seekable;
  if (!sk.length) return null;
  const target = (sk.start(0) + sk.end(sk.length - 1)) / 2;
  v.currentTime = target;
  return +target.toFixed(1);
}

const storageCount = (s) =>
  s.storage.map((x) => (typeof x === "object" ? JSON.stringify(x) : x));

export function run({
  steps = defaultSteps(),
  count = 2,
  name = "pause",
  tag = `p${Date.now() % 100000}`,
} = {}) {
  return background(name, async (log) => {
    for (let i = 0; i < steps.length; i++) {
      const { p, u, kind } = steps[i];
      await load(count, { player: p, streamUrl: u, swarmId: `rt-${tag}-${i}` });
      const settledMs = await settle(count, 40000);
      await inAll(count, "watchWaiting", [], "pause.js");
      let target = null;
      if (kind === "dvr") {
        await sleep(5000);
        target = seekToMiddle();
        await sleep(15000);
      } else {
        await sleep(20000);
      }
      const s0 = await inAll(count, "state");
      const lagBefore = state().lag;
      const tBefore = video().currentTime;
      video().pause();
      const storage = [];
      for (let k = 0; k < 4; k++) {
        await sleep(10000);
        storage.push(storageCount(state()));
      }
      const s1 = await inAll(count, "state");
      const tPaused = video().currentTime;
      await window.__h.play();
      await sleep(15000);
      const s2 = await inAll(count, "readTab");
      const w = await inAll(count, "waiting", [], "pause.js");
      const a = state();
      log({
        i,
        p,
        kind,
        u: u.split("/").slice(-2).join("/"),
        settledMs,
        target,
        tBefore: +tBefore.toFixed(1),
        tPaused: +tPaused.toFixed(1),
        tAfter: a.t,
        lagBefore,
        lagAfter: a.lag,
        waiting: w,
        storage,
        pause: stepRows(s1, s0),
        resume: stepRows(
          s2,
          s1,
          Object.fromEntries(s2.map((x) => [x.me, { probe: x.probe }])),
        ),
      });
    }
    return "done";
  });
}

/** One line per step. */
export function summarize(entries) {
  return entries.map((e) => ({
    step: `${e.i} ${e.p} ${e.kind} ${e.u} settled=${e.settledMs}`,
    a: `target${e.target} t${e.tBefore}->${e.tPaused}->${e.tAfter} lag${e.lagBefore}->${e.lagAfter} waiting${JSON.stringify(e.waiting.map((x) => x.n))}`,
    storage: e.storage.map((x) => x.join("|")).join(" ; "),
    pause: e.pause.map(
      (r) =>
        `rs${r.rs} held${JSON.stringify(r.held)} http${r.http}/p2p${r.p2p} an${r.anomalies.length}`,
    ),
    resume: e.resume.map(
      (r) =>
        `rs${r.rs} e${r.err} lag${r.lag} held${JSON.stringify(r.held)} http${r.http}/p2p${r.p2p} fail${JSON.stringify(r.failures)} an${r.anomalies.length} miss${r.probe?.misses} err${r.probe?.errors}`,
    ),
  }));
}
