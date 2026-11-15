// Test 6, quality switches (specs/release-testing.md). Uses the demo's
// quality selector (`select.quality-selector`): both tabs to one rendition at
// the same moment, this tab (A) alone to another, A back, then both on Auto.
// Each sample names the swarm of the rendition each tab plays and the peers
// it holds there; see `switchStep`.

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

// ---------------------------------------------------------------------------
// Which swarm is which rendition. A `P2PLoader` record names a stream by the
// start of its info hash and its stream ID (`<key>:main0`), a
// `PeersHeld:<key>` probe by the same start of its info hash,
// `computeInfoHash(streamSwarmId)`; the loaders container's log
// names the current loader by its stream ID (`main0`). These helpers keep that
// log and compute each loader's probe key, so a sample says how many peers a
// tab holds in the swarm of the rendition it plays.
// ---------------------------------------------------------------------------

const LOG_NS =
  /p2pml-core:(p2p-loaders-container|tracker|churn-cleanup|webtorrent-manager)/;

/**
 * Keeps the lines of the loggers in LOG_NS, with `Date.now()`, which is one
 * clock across a page and its iframe. The page's `localStorage.debug` must
 * enable them before it loads.
 */
export async function watchLog() {
  if (window.__QL) return "already";
  const url = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .find((n) => /\/deps\/debug\.js/.test(n));
  if (!url) return "no debug module among the page's resources";
  const debug = (await import(url)).default;
  const L = [];
  window.__QL = L;
  const previous = debug.log || console.debug;
  debug.log = function (...args) {
    const s = typeof args[0] === "string" ? args[0] : "";
    if (LOG_NS.test(s)) {
      if (L.length > 4000) L.shift();
      L.push({
        at: Date.now(),
        s: [s, ...args.slice(1).filter((x) => typeof x === "string")]
          .join(" ")
          .replace(/%c/g, "")
          .replace(/color: \S+/g, "")
          .replace(/\s+/g, " ")
          .slice(0, 220),
      });
    }
    return previous.apply(this, args);
  };
  return "watching";
}

/** The log lines kept since `at` (ms since the epoch). */
export const logSince = (at) => ({
  me: window.__me,
  lines: (window.__QL ?? []).filter((x) => x.at >= at),
});

/** The stream ID of this tab's current P2P loader, from the log. */
export function currentStream() {
  const L = window.__QL ?? [];
  for (let i = L.length - 1; i >= 0; i--) {
    const m = /(?:set|change) current p2p loader: (\S+)/.exec(L[i].s);
    if (m) return m[1];
  }
  return null;
}

let identity;
async function streamIdentity() {
  if (identity) return identity;
  // the core's own source, at the path the dev server serves it from
  const index = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .find((n) => /\/p2p-media-loader-core\/src\/index\.ts/.test(n));
  if (!index) return null;
  const base = index.replace(/index\.ts.*$/, "");
  identity = await import(`${base}stream-identity.ts`);
  return identity;
}

/** The `PeersHeld` key of the stream with this stream ID in this tab. */
export async function swarmKey(stream) {
  const id = await streamIdentity();
  const swarmId = new URLSearchParams(window.location.search).get("swarmId");
  if (!id || !stream || !swarmId) return null;
  const streamSwarmId = id.buildStreamSwarmId(swarmId, stream);
  return id.computeInfoHash(streamSwarmId).slice(0, 8);
}

/** This tab's current stream, its probe key, and the peers of every key. */
export async function swarmRow() {
  const probes = window.__p2pmlDiagnostics?.snapshot().probes ?? {};
  const held = Object.fromEntries(
    Object.entries(probes)
      .filter(([k]) => k.startsWith("PeersHeld:"))
      .map(([k, n]) => [k.slice("PeersHeld:".length), n]),
  );
  const stream = currentStream();
  const key = await swarmKey(stream);
  return {
    me: window.__me,
    rs: state().rs,
    height: document.querySelector("video")?.videoHeight,
    stream,
    key,
    peersInKey: key ? (held[key] ?? 0) : null,
    held,
  };
}

/** Every tab plays one swarm (other than `not`), and holds a peer in it. */
const together = (rows, not) =>
  rows.every((r) => r.key && r.key === rows[0].key && r.key !== not) &&
  rows.every((r) => r.peersInKey > 0);

/** Every tab plays one swarm (other than `not`): the players switched. */
const switched = (rows, not) =>
  rows.every((r) => r.key && r.key === rows[0].key && r.key !== not);

/**
 * One engine and stream, sampled every second: both tabs to rendition `one`
 * at the same moment, A alone to `two`, A back to `one`, then both on Auto.
 * Each sample names the swarm each tab plays and the peers it holds there.
 *
 * Pass (specs/release-testing.md, test 6): tabs on one rendition hold a peer
 * there within 10 s of the switch. The core can only join a rendition the
 * player requests, and players apply a manual switch late (dash.js 25-30 s,
 * Video.js 8 about 10 s), so each time is counted from the sample where the
 * players play the new rendition: `both.peerMs` and `back.peerMs` beside
 * the player's own `switchedMs`. A loader of a rendition a tab left stays
 * open for p2pInactiveLoaderDestroyTimeoutMs while it holds segments
 * (diagnostics.md): a switch back reuses it, and a tab alone on a rendition
 * the other played before still meets the other's open loader there
 * (`apart.otherOpen`); a peer held apart is a finding only without it.
 */
async function switchStep(count, { p, u, tag, holdMs, backWindowMs }) {
  await inAll(count, "watchLog", [], "quality.js");
  const t0 = Date.now();
  await load(count, { player: p, streamUrl: u, swarmId: `rt-${tag}` });
  const settledMs = await settle(count, 40000);
  await sleep(8000);
  const { options } = qualities();
  // two renditions in the middle of the list
  const one = Math.max(1, Math.floor(options.length / 2));
  const two = one + 1 < options.length ? one + 1 : one - 1;
  const start = await inAll(count, "swarmRow", [], "quality.js");
  const samples = [];
  /** Samples until `ok` has held for 5 s, or for `ms`; times of `steps`. */
  const sample = async (phase, ms, steps = {}) => {
    const begin = Date.now();
    const at = Object.fromEntries(Object.keys(steps).map((k) => [k, null]));
    const done = () => Object.values(at).every((v) => v != null);
    let last = null;
    while (Date.now() - begin < ms) {
      const rows = await inAll(count, "swarmRow", [], "quality.js");
      const t = Date.now() - begin;
      samples.push({ phase, t, rows });
      for (const [k, f] of Object.entries(steps)) {
        if (at[k] == null && f(rows)) at[k] = t;
      }
      if (Object.keys(steps).length && done()) {
        last ??= t;
        if (t - last > 5000) break;
      }
      await sleep(1000);
    }
    return at;
  };
  const timing = (at) => ({
    switchedMs: at.switched,
    peerMs:
      at.switched != null && at.together != null
        ? at.together - at.switched
        : null,
  });

  await inAll(count, "pick", [one], "quality.js");
  // a rendition other than the one Auto played at the start
  const both = timing(
    await sample("both on one", 40000, {
      switched: (r) => switched(r, start[0].key),
      together: (r) => together(r, start[0].key),
    }),
  );
  const oneKey = samples.at(-1).rows[0].key;

  pick(two);
  await sample("A on two", holdMs, {
    apart: (r) => r[0].key && r[1].key && r[0].key !== r[1].key,
  });
  const [a, b] = samples.at(-1).rows;
  const apart = {
    keys: [a.key, b.key],
    peers: a.peersInKey,
    // B still has a loader open in A's swarm, from a rendition it left
    otherOpen: a.key != null && a.key in b.held,
  };

  pick(one);
  const backAt = Date.now();
  const back = timing(
    await sample("A back on one", backWindowMs, {
      switched: (r) => r.every((x) => x.key === oneKey),
      together: (r) => r.every((x) => x.key === oneKey && x.peersInKey > 0),
    }),
  );

  await inAll(count, "pick", [0], "quality.js");
  await sample("both on Auto", 15000);
  return {
    p,
    settledMs,
    labels: [options[one]?.[1], options[two]?.[1]],
    both,
    apart,
    back,
    samples: samples.map((x) => ({
      phase: x.phase,
      t: x.t,
      rows: x.rows.map(
        (r) => `${r.height}p ${r.stream?.slice(-8)} ${r.key}:${r.peersInKey}`,
      ),
    })),
    logs: await inAll(count, "logSince", [t0], "quality.js"),
    backAt,
    anomalies: (await inAll(count, "state")).map((x) => [
      x.me,
      x.anomalies.length,
    ]),
  };
}

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
  holdMs = 20000,
  backWindowMs = 40000,
  name = "quality",
  tag = `q${Date.now() % 100000}`,
} = {}) {
  return background(name, async (log) => {
    for (let i = 0; i < steps.length; i++) {
      const { p, u } = steps[i];
      log({
        i,
        ...(await switchStep(count, {
          p,
          u,
          tag: `${tag}-${i}`,
          holdMs,
          backWindowMs,
        })),
      });
    }
    return "done";
  });
}

/** One line per step. */
export function summarize(entries) {
  return entries.map((e) => ({
    step: `${e.i} ${e.p} settled=${e.settledMs} ${JSON.stringify(e.labels)}`,
    both: `player switched ${e.both.switchedMs}ms, peer ${e.both.peerMs}ms after`,
    apart: `${e.apart.keys.join("/")}: A holds ${e.apart.peers}${e.apart.otherOpen ? " (B's open loader of a rendition it left)" : ""}`,
    back: `player switched ${e.back.switchedMs}ms, peer ${e.back.peerMs}ms after`,
    anomalies: JSON.stringify(e.anomalies),
  }));
}
