// Test 12, configuration (specs/release-testing.md). Needs the temporary
// demo edit of test 12, which reads `p2p=0`, `upload=0` and `hook=1` from
// the query (see the test; never commit it). Each step sets its parameters
// per tab, so that one tab can differ from the other.

import {
  STREAMS as S,
  background,
  delta,
  go,
  inAll,
  settle,
  sleep,
  state,
} from "./lib.js";

/* global window */

/** Loads `params` merged with `perTab[i]` in tab `i` (0 is this tab, A). */
export function goAs(params, perTab) {
  const i = window.__me === window.__tabA ? 0 : 1;
  window.__hookCalls = [];
  return go({ ...params, ...(perTab[i] ?? {}) });
}

export const markA = (me) => ((window.__tabA = me), true);

export function readConfig() {
  const s = state();
  return {
    me: window.__me,
    rs: s.rs,
    err: s.err,
    held: s.held,
    sockets: s.sockets,
    loaders: s.loaders,
    counters: s.counters,
    hookCalls: (window.__hookCalls ?? []).length,
    anomalies: s.anomalies.length,
  };
}

async function step(count, label, params, perTab, log, ms = 30000) {
  await inAll(count, "markA", [window.__me], "config.js");
  await inAll(count, "goAs", [params, perTab], "config.js");
  await sleep(5000);
  await inAll(count, "play");
  const before = await inAll(count, "readConfig", [], "config.js");
  await settle(count, 20000, false);
  await sleep(ms);
  const after = await inAll(count, "readConfig", [], "config.js");
  log({
    label,
    tabs: after.map((a) => {
      const d = delta(a.counters, before.find((b) => b.me === a.me)?.counters);
      return {
        tab: a.me === window.__me ? "A" : "B",
        rs: a.rs,
        err: a.err,
        held: a.held,
        sockets: a.sockets,
        loaders: a.loaders.length,
        http: d["Download:http:succeed"] ?? 0,
        p2p: d["Download:p2p:succeed"] ?? 0,
        uploads: Object.fromEntries(
          Object.entries(d).filter(([k]) => /upload|Upload/.test(k)),
        ),
        hookCalls: a.hookCalls,
        // each HTTP download in the run, the hook included
        httpTotal: a.counters["Download:http:succeed"] ?? 0,
        anomalies: a.anomalies,
      };
    }),
  });
}

export function run({
  count = 2,
  name = "config",
  tag = `c${Date.now() % 100000}`,
} = {}) {
  return background(name, async (log) => {
    const base = { player: "hlsjs_hls", streamUrl: S.MUX };
    await step(
      count,
      "different swarmId per tab",
      base,
      [{ swarmId: `rt-${tag}-a` }, { swarmId: `rt-${tag}-b` }],
      log,
    );
    await step(
      count,
      "P2P disabled in both",
      { ...base, swarmId: `rt-${tag}-off`, p2p: "0" },
      [],
      log,
      20000,
    );
    await step(
      count,
      "upload disabled in B",
      { ...base, swarmId: `rt-${tag}-up` },
      [{}, { upload: "0" }],
      log,
    );
    await step(
      count,
      "httpRequestSetup hook in both",
      { ...base, swarmId: `rt-${tag}-hook`, hook: "1" },
      [],
      log,
    );
    await step(
      count,
      "IndexedDB storage example",
      {
        player: "hlsjs_indexeddb_hls",
        streamUrl: S.MUX,
        swarmId: `rt-${tag}-idb`,
      },
      [],
      log,
    );
    return "done";
  });
}
