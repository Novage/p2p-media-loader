// Shared helpers of the release test scripts; see README.md. Loaded into a
// driven page (`?driver=1`) with `await import("/release-tests/lib.js")`.
// Every export runs in the page that imported it; `inAll` runs one in every
// driven tab.

/* global window, document, performance, localStorage, location */

const h = () => window.__h;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until `f()` is true, polling; resolves with the ms it took, or null. */
export async function until(f, ms, step = 25) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    if (f()) return Math.round(performance.now() - t0);
    await sleep(step);
  }
  return null;
}

export const median = (values) => {
  const s = values.filter((v) => v != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};

/**
 * The streams of specs/verification.md, which is their source. A stream that
 * goes offline is replaced there first, then here.
 */
export const STREAMS = {
  // HLS
  MUX: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  HLS_LIVE:
    "https://hls-harbor-livepush.akamaized.net/live_cdn/nsqIStpj8PaG-Ev/emcQJ0pGpremocy/index.m3u8",
  DVR: "https://demo.unified-streaming.com/k8s/live/scte35.isml/.m3u8",
  // DASH
  BBB: "https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd",
  ANGEL: "https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd",
  NETFLIX:
    "https://dash.akamaized.net/dash264/TestCases/1a/netflix/exMPD_BIP_TC1.mpd",
  TP8: "https://livesim2.dashif.org/livesim2/testpic4_8s/Manifest.mpd",
  TP2: "https://livesim2.dashif.org/livesim2/testpic_2s/Manifest.mpd",
  SEGTL:
    "https://livesim2.dashif.org/livesim2/segtimeline_1/testpic_2s/Manifest.mpd",
  // special cases
  AUDIO_ONLY: "https://livesim2.dashif.org/livesim2/testpic_2s/audio.mpd",
  PERIODS:
    "https://livesim2.dashif.org/livesim2/periods_60/testpic_2s/Manifest.mpd",
  LL_DASH:
    "https://livesim2.dashif.org/livesim2/chunkdur_1/ato_7/testpic4_8s/Manifest300.mpd",
  LL_HLS:
    "https://stream.mux.com/v69RSHhFelSm4701snP22dYz2jICy4E4FUyk02rW4gxRM.m3u8",
  MULTI_AUDIO_SUBS:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
  AES128:
    "https://playertest.longtailvideo.com/adaptive/oceans_aes/oceans_aes.m3u8",
};

export const HLS_ENGINES = ["hlsjs_hls", "shaka", "videojs", "videojs10_hls"];
export const DASH_ENGINES = ["dashjs", "shaka", "videojs", "videojs10_dashjs"];

/**
 * Runs `fn(...args)` of this library, or of another release-test module, in
 * this tab and in `count - 1` other driven tabs, and returns every reply.
 */
export function inAll(count, fn, args = [], module = "lib.js", ms = 20000) {
  const code = `return (await import("/release-tests/${module}")).${fn}(...${JSON.stringify(args)})`;
  return h().all(code, count, ms);
}

/** Runs `fn(...args)` in the other driven tabs only. */
export function inOthers(count, fn, args = [], module = "lib.js", ms = 20000) {
  const code = `return (await import("/release-tests/${module}")).${fn}(...${JSON.stringify(args)})`;
  return h().others(code, count - 1, ms);
}

/**
 * Changes the stream or player. The demo's temporary edit of test 12 reads
 * `p2p`, `upload` and `hook`; they are cleared unless given, so a test never
 * inherits another's setting.
 */
export function go(params) {
  h().go({ p2p: "", upload: "", hook: "", ...params });
  return true;
}

/**
 * Plays with sound through the driver, and muted where the browser refuses
 * sound without a click: Safari does, also in a visible window.
 */
export async function play() {
  h().play();
  const v = video();
  if (!v) return false;
  // a play that waits for data resolves late; only a refusal matters here
  const refused = await Promise.race([
    v.play().then(
      () => false,
      (e) => e?.name === "NotAllowedError",
    ),
    sleep(2000).then(() => false),
  ]);
  // Safari can refuse after the wait, which leaves the video paused
  if (refused || v.paused) {
    v.muted = true;
    v.play().catch(() => undefined);
  }
  return !v.paused;
}

/** The id the driver gave this tab. */
export const me = () => window.__me;

// ---------------------------------------------------------------------------
// The probe: what the core decided, beside what the media element held.
// ---------------------------------------------------------------------------

function bufferAhead(video) {
  if (!video) return null;
  const t = video.currentTime;
  const b = video.buffered;
  for (let i = 0; i < b.length; i++) {
    if (b.start(i) <= t + 0.15 && b.end(i) >= t) {
      return +(b.end(i) - t).toFixed(2);
    }
  }
  return 0;
}

/**
 * Wraps the `debug` library's log function, so that each urgency decision of
 * the hybrid loader is kept with the element's own buffer at that moment, and
 * each registry miss with its URL. Also keeps console errors and uncaught
 * errors with their stacks. The page's `localStorage.debug` must enable
 * `p2pml-core:hybrid-loader-*` and `p2pml-core:registry-miss` before it loads.
 */
export async function installProbe() {
  if (window.__U) return "already";
  performance.setResourceTimingBufferSize(20000);
  // Vite's pre-bundled `debug`, whatever hash it has this time; the core
  // imports the same URL, so this is the same module instance.
  const url = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .find((n) => /\/deps\/debug\.js/.test(n));
  if (!url) return "no debug module among the page's resources";
  const debug = (await import(url)).default;
  const U = { urg: [], miss: [], err: [], stream: [] };
  window.__U = U;
  const original = debug.log || console.debug;
  debug.log = function (...args) {
    try {
      const s = typeof args[0] === "string" ? args[0] : "";
      const m =
        /(not urgent|urgent): (.*?) \(buffer ([\d.]+)s, threshold ([\d.]+)s\)/.exec(
          s,
        );
      if (m) {
        if (U.urg.length > 5000) U.urg.shift();
        U.urg.push({
          u: m[1] === "urgent",
          seg: m[2].slice(0, 80),
          core: +m[3],
          thr: +m[4],
          el: bufferAhead(document.querySelector("video")),
          at: Math.round(performance.now()),
        });
      } else if (s.includes("registry-miss")) {
        if (U.miss.length > 500) U.miss.shift();
        U.miss.push(
          args
            .slice(1)
            .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
            .join(" ")
            .replace(/color: \S+ ?/g, "")
            .slice(0, 300),
        );
      } else if (s.includes("stream changed to")) {
        U.stream.push({
          at: Math.round(performance.now()),
          s: s.slice(0, 160),
        });
      }
    } catch {
      // the probe never gets in the way of the log
    }
    return original.apply(console, args);
  };
  const consoleError = console.error.bind(console);
  console.error = (...args) => {
    U.err.push(
      args
        .map((x) => (typeof x === "string" ? x : x?.message || String(x)))
        .join(" ")
        .slice(0, 300),
    );
    return consoleError(...args);
  };
  window.addEventListener("error", (e) =>
    U.err.push(
      `uncaught: ${e.message} @ ${String(e.error?.stack || "")
        .split("\n")
        .slice(1, 3)
        .join(" <- ")
        .replace(/http:\/\/localhost:\d+/g, "")}`.slice(0, 400),
    ),
  );
  window.addEventListener("unhandledrejection", (e) =>
    U.err.push(
      `unhandled: ${String(e.reason?.message || e.reason)}`.slice(0, 300),
    ),
  );
  return "installed";
}

/** Empties the probe's lists, so that the next read covers one step. */
export function resetProbe() {
  const U = window.__U;
  if (!U) return false;
  U.urg.length = 0;
  U.miss.length = 0;
  U.err.length = 0;
  U.stream.length = 0;
  window.__p2pmlDiagnostics?.clearAnomalies();
  return true;
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

/** The page's main video: the largest one on screen. */
export function video() {
  const all = [...document.querySelectorAll("video")];
  return (
    all
      .filter((v) => v.clientWidth > 0)
      .sort(
        (a, b) =>
          b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight,
      )[0] ??
    all[0] ??
    null
  );
}

/**
 * This tab's state: the media element, the ledger's counters, open records,
 * probes and anomalies, and the peers each swarm holds.
 */
export function state() {
  const v = video();
  const s = window.__p2pmlDiagnostics?.snapshot();
  const sk = v?.seekable;
  const probes = s?.probes ?? {};
  const q = v?.getVideoPlaybackQuality?.();
  return {
    me: window.__me,
    rs: v?.readyState,
    err: v?.error?.code ?? null,
    paused: v?.paused,
    ended: v?.ended,
    t: v ? +v.currentTime.toFixed(1) : null,
    lag:
      v && sk?.length
        ? +(sk.end(sk.length - 1) - v.currentTime).toFixed(1)
        : null,
    blob: (v?.currentSrc || v?.src || "").startsWith("blob:"),
    ahead: bufferAhead(v),
    frames: q ? [q.droppedVideoFrames, q.totalVideoFrames] : null,
    counters: s?.counters ?? {},
    open: s?.open ?? [],
    anomalies: s?.anomalies ?? [],
    held: Object.entries(probes)
      .filter(([k]) => k.startsWith("PeersHeld"))
      .map(([, n]) => n),
    wrapped: Object.entries(probes)
      .filter(([k]) => k.startsWith("PeersWrapped"))
      .map(([, n]) => n),
    storage: Object.entries(probes)
      .filter(([k]) => k.startsWith("Storage"))
      .map(([, x]) => x),
    loaders: (s?.open ?? [])
      .filter((t) => t.startsWith("P2PLoader"))
      .map((t) => t.split(" ")[1]),
    sockets: (s?.open ?? []).filter((t) => t.startsWith("TrackerSocket"))
      .length,
  };
}

/** What the probe kept since the last reset, summarized. */
export function probeSummary() {
  const U = window.__U;
  if (!U) return null;
  const diffs = U.urg
    .filter((x) => x.el != null)
    .map((x) => +Math.abs(x.core - x.el).toFixed(2));
  return {
    requests: U.urg.length,
    urgent: U.urg.filter((x) => x.u).length,
    maxBufferDiff: diffs.length ? Math.max(...diffs) : 0,
    // judged urgent although the element's buffer was above the threshold
    urgentWithBuffer: U.urg.filter((x) => x.u && x.el != null && x.el > x.thr)
      .length,
    // each with the time from the step's start, to place it in the step
    urgentWithBufferSample: U.urg
      .filter((x) => x.u && x.el != null && x.el > x.thr)
      .slice(0, 4),
    // judged not urgent although the buffer was below the threshold
    notUrgentLow: U.urg.filter((x) => !x.u && x.core < x.thr).length,
    misses: U.miss.length,
    missSample: U.miss.slice(0, 3),
    errors: U.err.length,
    errorSample: U.err.slice(0, 4),
  };
}

/** Counter differences between two snapshots. */
export function delta(after, before) {
  const out = {};
  for (const [key, value] of Object.entries(after ?? {})) {
    const previous = before?.[key] ?? 0;
    if (value !== previous) out[key] = value - previous;
  }
  return out;
}

/** The token number of a record, `Kind#n detail`. */
export const tokenNumber = (token) => +(/#(\d+)/.exec(token)?.[1] ?? 0);

/**
 * One row per tab for a step: playback, P2P and HTTP of the step, records of
 * the previous step still open, anomalies, and the probe's summary.
 */
export function stepRows(after, before, extra = {}) {
  return after.map((a) => {
    const b = before.find((x) => x?.me === a.me) ?? {};
    const d = delta(a.counters, b.counters);
    return {
      me: a.me,
      rs: a.rs,
      err: a.err,
      paused: a.paused,
      lag: a.lag,
      held: a.held,
      loaders: a.loaders,
      http: d["Download:http:succeed"] ?? 0,
      p2p: d["Download:p2p:succeed"] ?? 0,
      failures: Object.fromEntries(
        // peer closes beside failures: a P2P failure with no peer closed is
        // the unexpected one (specs/diagnostics.md, "Reading a snapshot")
        Object.entries(d).filter(([k]) =>
          /fail|abort|Miss|PeerClosed/i.test(k),
        ),
      ),
      leaked: (b.open ?? []).filter((t) => a.open.includes(t)),
      anomalies: a.anomalies,
      ...(extra[a.me] ?? {}),
    };
  });
}

/** A step's full read in every tab: state and the probe's summary. */
export async function readAll(count) {
  return inAll(count, "readTab");
}

export function readTab() {
  return { ...state(), probe: probeSummary() };
}

// ---------------------------------------------------------------------------
// Results, kept in localStorage so that a reload loses nothing
// ---------------------------------------------------------------------------

/** A logger for test `name`: each entry is kept as it is recorded. */
export function keep(name) {
  const key = `__rt_${name}`;
  return (entry) => {
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    list.push(entry);
    localStorage.setItem(key, JSON.stringify(list));
    return entry;
  };
}

export const results = (name) =>
  JSON.parse(localStorage.getItem(`__rt_${name}`) || "[]");

/** Removes every saved result. */
export function clear() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("__rt_")) localStorage.removeItem(key);
  }
  return true;
}

/**
 * Runs `task(log)` in the background of this page, so that a test longer
 * than a tool call keeps going; poll `window.__R[name]` or `results(name)`.
 */
export function background(name, task) {
  const log = keep(name);
  return window.__bg(name, () => task(log));
}

/** Loads the demo's tabs for a step and starts them playing. */
export async function load(count, params, settleMs = 5000) {
  await inAll(count, "resetProbe");
  await inAll(count, "go", [params]);
  await sleep(settleMs);
  await inAll(count, "play");
}

/**
 * Waits until every tab plays and, unless `peers` is false, holds a peer; at
 * most `ms`. Returns the ms it took, or null.
 */
export async function settle(count, ms = 30000, peers = true) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    const rows = await inAll(count, "state");
    const ok =
      rows.length === count &&
      rows.every((r) => r.rs >= 3 && (!peers || r.held.some((n) => n > 0)));
    if (ok) return Math.round(performance.now() - t0);
    await sleep(1000);
  }
  return null;
}

export const href = () => location.href;
