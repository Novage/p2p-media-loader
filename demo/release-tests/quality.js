// Test 6, quality switches (specs/release-testing.md). Uses the demo's
// quality selector (`select.quality-selector`): both tabs to one rendition at
// the same moment, this tab (A) alone to another, A back, then both on Auto.
// After each switch it polls every tab until the expected peers are held,
// and records the swarms of the open P2P loaders, so that a loader of the
// old rendition left open shows.

import {
  STREAMS as S,
  background,
  inAll,
  load,
  settle,
  sleep,
  state,
} from "./lib.js";

/* global window, document, Event, performance */

const selector = () => document.querySelector("select.quality-selector");

/** The selector's options, Auto included, as `[value, label]`. */
export function qualities() {
  const s = selector();
  return {
    me: window.__me,
    options: s ? [...s.options].map((o) => [o.value, o.text]) : [],
  };
}

/** Selects the option at `index` (0 is Auto) and fires its change. */
export function pick(index) {
  const s = selector();
  if (!s || !s.options[index]) return false;
  s.selectedIndex = index;
  s.dispatchEvent(new Event("change"));
  return s.options[index].text;
}

/** The swarms (`PeersHeld:<swarm>` probes) where this tab holds a peer. */
export function heldSwarms() {
  const probes = window.__p2pmlDiagnostics?.snapshot().probes ?? {};
  return Object.entries(probes)
    .filter(([k, n]) => k.startsWith("PeersHeld:") && n > 0)
    .map(([k]) => k.slice("PeersHeld:".length));
}

export function row() {
  const s = state();
  return {
    me: s.me,
    rs: s.rs,
    held: s.held,
    swarms: heldSwarms(),
    loaders: s.loaders,
  };
}

/**
 * Polls every tab for `ms` after a switch; `ok(rows)` says when the step's
 * expectation holds. Returns the ms until then (null if never) and the rows.
 */
async function watch(count, ok, ms) {
  const t0 = performance.now();
  const samples = [];
  let at = null;
  while (performance.now() - t0 < ms) {
    const rows = await inAll(count, "row", [], "quality.js");
    samples.push({ t: Math.round(performance.now() - t0), rows });
    if (at == null && ok(rows)) at = Math.round(performance.now() - t0);
    if (at != null && performance.now() - t0 - at > 8000) break;
    await sleep(1000);
  }
  return { at, last: samples.at(-1), samples: samples.slice(-3) };
}

// A swarm where every tab holds a peer. A loader of the old rendition stays
// open for p2pInactiveLoaderDestroyTimeoutMs by design (diagnostics.md), so
// the tabs' loader lists differ for a while after a switch back.
const shared = (rows) =>
  rows[0].swarms.filter((s) => rows.every((r) => r.swarms.includes(s)));

export function defaultSteps() {
  return [
    { p: "hlsjs_hls", u: S.MUX },
    { p: "dashjs", u: S.BBB },
    { p: "videojs", u: S.MUX },
  ];
}

export function run({
  steps = defaultSteps(),
  count = 2,
  name = "quality",
  tag = `q${Date.now() % 100000}`,
} = {}) {
  return background(name, async (log) => {
    for (let i = 0; i < steps.length; i++) {
      const { p, u } = steps[i];
      await load(count, { player: p, streamUrl: u, swarmId: `rt-${tag}-${i}` });
      const settledMs = await settle(count, 40000);
      await sleep(8000);
      const { options } = qualities();
      // two renditions in the middle of the list
      const one = Math.max(1, Math.floor(options.length / 2));
      const two = one + 1 < options.length ? one + 1 : one - 1;
      const entry = { i, p, settledMs, options: options.length };
      entry.start = await inAll(count, "row", [], "quality.js");
      const startShared = shared(entry.start);

      // both tabs to one rendition: they share a swarm they did not before
      entry.labels = await inAll(count, "pick", [one], "quality.js");
      entry.both = await watch(
        count,
        (r) => shared(r).some((s) => !startShared.includes(s)),
        40000,
      );
      const bothShared = shared(entry.both.last.rows);

      // A alone to another: a swarm the tabs shared is no longer shared
      entry.labelA = pick(two);
      entry.aOnly = await watch(
        count,
        (r) => bothShared.some((s) => !shared(r).includes(s)),
        40000,
      );
      const now = shared(entry.aOnly.last.rows);
      entry.dropped = bothShared.filter((s) => !now.includes(s));

      // A back: the tabs share each dropped swarm again
      pick(one);
      entry.back = await watch(
        count,
        (r) =>
          entry.dropped.length > 0 &&
          entry.dropped.every((s) => shared(r).includes(s)),
        40000,
      );

      await inAll(count, "pick", [0], "quality.js");
      entry.auto = await watch(count, () => false, 15000);
      entry.end = { ...state(), counters: undefined, open: undefined };
      entry.anomalies = (await inAll(count, "state")).map((s) => [
        s.me,
        s.anomalies.length,
      ]);
      log(entry);
    }
    return "done";
  });
}

/** One line per step and switch. */
export function summarize(entries) {
  const show = (w) =>
    `at${w.at} ${w.last.rows.map((r) => `rs${r.rs} held${JSON.stringify(r.held)} shared:${r.swarms.join("+")} ${r.loaders.join("+")}`).join(" | ")}`;
  return entries.map((e) => ({
    step: `${e.i} ${e.p} settled=${e.settledMs} options=${e.options} ${JSON.stringify(e.labels)} A:${e.labelA}`,
    both: show(e.both),
    aOnly: show(e.aOnly),
    back: show(e.back),
    auto: show(e.auto),
    anomalies: JSON.stringify(e.anomalies),
  }));
}
