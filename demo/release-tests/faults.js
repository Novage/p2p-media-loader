// Test 10, network faults (specs/release-testing.md). `installFaults` wraps
// fetch, XMLHttpRequest and WebSocket in a tab; the driver changes players
// without a reload, so the players made afterwards use the wrappers. Every
// fault is counted where it is injected: a phase whose fault count is zero
// did not run.

import {
  STREAMS as S,
  background,
  delta,
  inAll,
  load,
  settle,
  sleep,
  state,
} from "./lib.js";

/* global window, Response, DOMException, XMLHttpRequest, URL, Headers, performance, history, location, URLSearchParams, PopStateEvent, dispatchEvent */

const isSegment = (u) => /\.(ts|m4s|mp4|m4v|m4a|aac|webm)(\?|$)/i.test(u);
const isManifest = (u) => /\.(m3u8|mpd)(\?|$)/i.test(u);
const SEG_LOG_LIMIT = 2000;

/**
 * The end of a `Range` header: "" for none or an open range. A retry that
 * goes on from bytes held asks for a later start, but the same end, so the
 * end tells a segment's retry from the next segment of the same file.
 */
function rangeEnd(range) {
  return /^bytes=\d*-(\d*)$/.exec(range)?.[1] ?? "";
}

/**
 * A request's `Range` header, or "". A byte-range stream requests many
 * segments from one URL, so a retry is told by its range as well.
 */
function rangeOf(input, init) {
  try {
    const headers = init?.headers
      ? new Headers(init.headers)
      : typeof input === "string"
        ? undefined
        : input.headers;
    return headers?.get("Range") ?? "";
  } catch {
    return "";
  }
}

export function installFaults() {
  if (window.__F) return "already";
  const F = {
    segFail: 0,
    segMode: "404",
    delay: 0,
    manifestFail: 0,
    wsBlockUntil: 0,
    counts: {},
    ws: [],
    // Each segment request: when, which URL and byte range, and what it got:
    // the fault, or "network" where it went to the network (whether that
    // download then succeeded is not known here). `retryGaps` reads it.
    // Only the latest SEG_LOG_LIMIT are kept; `segDropped` counts the rest,
    // so that a `segMark` taken earlier still points at the same request.
    seg: [],
    segDropped: 0,
  };
  window.__F = F;
  const inc = (k) => (F.counts[k] = (F.counts[k] || 0) + 1);
  const aborted = () => new DOMException("Aborted", "AbortError");

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url || String(input);
    const signal =
      init?.signal || (typeof input === "string" ? undefined : input.signal);
    if (F.delay) {
      inc("delayed");
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, F.delay);
        signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(aborted());
        });
      });
    }
    if (isManifest(url) && F.manifestFail > 0) {
      F.manifestFail--;
      inc("manifest-fetch");
      return new Response("", { status: 503 });
    }
    const segRecord = isSegment(url)
      ? {
          at: Math.round(performance.now()),
          url,
          range: rangeOf(input, init),
          got: "network",
        }
      : undefined;
    if (segRecord) {
      F.seg.push(segRecord);
      if (F.seg.length > SEG_LOG_LIMIT) {
        F.seg.shift();
        F.segDropped++;
      }
    }
    if (segRecord && F.segFail && Math.random() < F.segFail) {
      inc(`seg-${F.segMode}`);
      segRecord.got = F.segMode;
      if (F.segMode === "hang") {
        // honours the abort signal, or a request that never answers could
        // not be cancelled
        return new Promise((_, reject) => {
          if (signal?.aborted) reject(aborted());
          signal?.addEventListener("abort", () => {
            inc("hang-aborted");
            reject(aborted());
          });
        });
      }
      return new Response("", { status: +F.segMode });
    }
    return realFetch(input, init);
  };

  // HLS.js, dash.js and Video.js fetch manifests with XMLHttpRequest.
  const X = XMLHttpRequest.prototype;
  const open = X.open;
  const send = X.send;
  X.open = function (method, url, ...rest) {
    let target = String(url);
    if (isManifest(target) && F.manifestFail > 0) {
      F.manifestFail--;
      inc("manifest-xhr");
      target = new URL("/__release_test_missing__.m3u8", target).href;
    }
    return open.call(this, method, target, ...rest);
  };
  X.send = function (...args) {
    if (F.delay) {
      inc("delayed-xhr");
      setTimeout(() => send.apply(this, args), F.delay);
      return;
    }
    return send.apply(this, args);
  };

  const RealWebSocket = window.WebSocket;
  function WebSocket(url, protocols) {
    const refused = Date.now() < F.wsBlockUntil;
    F.ws.push({
      at: Math.round(performance.now()),
      url: String(url).slice(0, 40),
      refused,
    });
    if (refused) {
      inc("ws-refused");
      return new RealWebSocket("ws://127.0.0.1:9/");
    }
    const socket =
      protocols === undefined
        ? new RealWebSocket(url)
        : new RealWebSocket(url, protocols);
    (window.__wsOpen ||= []).push(socket);
    return socket;
  }
  WebSocket.prototype = RealWebSocket.prototype;
  for (const k of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"])
    WebSocket[k] = RealWebSocket[k];
  window.WebSocket = WebSocket;
  return "installed";
}

/**
 * How soon each segment request that got a 404 or 503 was followed by the
 * next request for the same segment: the same URL, and a byte range with the
 * same end (`rangeEnd`). HTTP retries wait 1 s, then twice as long, up to
 * 30 s, except for an urgent player request (specs/playback-contract.md,
 * "Urgency"). Also the ledger's retry counters.
 *
 * @param marks - The tabs' `segMark` results from the start of the phase;
 *   each tab reads its own. Only requests since its mark are measured.
 */
export function retryGaps(marks = []) {
  const F = window.__F;
  const mark = marks.find((m) => m.me === window.__me)?.n ?? 0;
  const log = F.seg.slice(Math.max(0, mark - F.segDropped));
  // One pass from the newest: `nextAt` holds the time of the next request
  // for each segment seen so far.
  const nextAt = new Map();
  const gaps = [];
  let failed = 0;
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i];
    const key = `${entry.url} ${rangeEnd(entry.range)}`;
    if (entry.got === "404" || entry.got === "503") {
      failed++;
      if (nextAt.has(key)) gaps.push(nextAt.get(key) - entry.at);
    }
    nextAt.set(key, entry.at);
  }
  gaps.sort((a, b) => a - b);
  const counters = window.__p2pmlDiagnostics?.snapshot().counters ?? {};
  return {
    me: window.__me,
    failed,
    retried: gaps.length,
    under100ms: gaps.filter((g) => g < 100).length,
    from100to900ms: gaps.filter((g) => g >= 100 && g < 900).length,
    atLeast900ms: gaps.filter((g) => g >= 900).length,
    gaps,
    counters: Object.fromEntries(
      Object.entries(counters).filter(([k]) =>
        /^(HttpRetry|SegmentRequest:(urgent|peer-after))/.test(k),
      ),
    ),
  };
}

export const segMark = () => ({
  me: window.__me,
  n: window.__F.segDropped + window.__F.seg.length,
});

export function setFaults(settings) {
  Object.assign(window.__F, settings);
  return true;
}

export function clearFaults() {
  Object.assign(window.__F, { segFail: 0, delay: 0, manifestFail: 0 });
  return true;
}

/** Closes this tab's tracker sockets and refuses new ones for `ms`. */
export function dropTrackers(ms) {
  const F = window.__F;
  F.wsBlockUntil = Date.now() + ms;
  F.wsMark = F.ws.length;
  for (const s of window.__wsOpen || []) {
    try {
      s.close();
    } catch {
      // already closed
    }
  }
  window.__wsOpen = [];
  return true;
}

export const wsAttempts = (from = 0) => window.__F.ws.slice(from);

/** State plus the fault counts and the number of `waiting` events since `watchStalls`. */
export function faultState() {
  return {
    ...state(),
    faults: { ...window.__F.counts },
    stalls: window.__stalls || 0,
  };
}

export function watchStalls() {
  const v = document.querySelector("video");
  window.__stalls = 0;
  v?.addEventListener(
    "waiting",
    () => (window.__stalls = (window.__stalls || 0) + 1),
  );
  return true;
}

function rows(after, before, meA) {
  return after.map((a) => {
    const b = before.find((x) => x.me === a.me) ?? {};
    const d = delta(a.counters, b.counters);
    return {
      tab: a.me === meA ? "A" : "B",
      rs: a.rs,
      err: a.err,
      lag: a.lag,
      stalls: a.stalls - (b.stalls ?? 0),
      held: a.held,
      sockets: a.sockets,
      http: d["Download:http:succeed"] ?? 0,
      p2p: d["Download:p2p:succeed"] ?? 0,
      other: Object.fromEntries(
        Object.entries(d).filter(
          ([k]) =>
            !/^(Download:(http|p2p):succeed|PlayerRequest:succeed|ManifestParse:succeed|Evicted)/.test(
              k,
            ),
        ),
      ),
      faults: delta(a.faults, b.faults),
      peersKept: (b.open ?? []).filter(
        (t) => t.startsWith("Peer#") && a.open.includes(t),
      ).length,
      anomalies: a.anomalies,
    };
  });
}

/**
 * Installs the faults in `count` tabs, plays the stream in them and waits
 * until it settles. Returns `phase`: `settingsA` in this tab (A) and
 * `settingsB` in every tab for `ms`, then 15 s to recover; the counts of
 * both, and the retry gaps, are logged.
 */
async function startFaultRun(count, { player, streamUrl, tag }, log) {
  const meA = window.__me;
  log({ installed: await inAll(count, "installFaults", [], "faults.js") });
  await load(count, { player, streamUrl, swarmId: `rt-${tag}` });
  log({ settledMs: await settle(count, 40000) });
  await inAll(count, "watchStalls", [], "faults.js");
  await sleep(10000);

  return async (label, settingsA, settingsB, ms) => {
    const before = await inAll(count, "faultState", [], "faults.js");
    const segMarks = await inAll(count, "segMark", [], "faults.js");
    await inAll(count, "setFaults", [settingsB], "faults.js");
    window.__F && Object.assign(window.__F, settingsA);
    await sleep(ms);
    const during = await inAll(count, "faultState", [], "faults.js");
    await inAll(count, "clearFaults", [], "faults.js");
    await sleep(15000);
    const after = await inAll(count, "faultState", [], "faults.js");
    log({
      phase: label,
      during: rows(during, before, meA),
      recovery: rows(after, during, meA),
      retries: await inAll(count, "retryGaps", [segMarks], "faults.js"),
    });
  };
}

/**
 * The faults of test 10 in two tabs, on HLS.js with the live HLS stream:
 * segment 404, 503 and no answer in tab A while tab B holds the segments,
 * manifest errors, a slow network, tracker sockets closed and refused, and a
 * tracker that does not exist.
 */
export function run({
  count = 2,
  name = "faults",
  player = "hlsjs_hls",
  streamUrl = S.HLS_LIVE,
  tag = `f${Date.now() % 100000}`,
} = {}) {
  return background(name, async (log) => {
    const meA = window.__me;
    const phase = await startFaultRun(count, { player, streamUrl, tag }, log);
    await phase(
      "segment 404 in A",
      { segFail: 0.4, segMode: "404" },
      {},
      30000,
    );
    await phase(
      "segment 503 in A",
      { segFail: 0.4, segMode: "503" },
      {},
      30000,
    );
    await phase(
      "segment never answers in A",
      { segFail: 0.3, segMode: "hang" },
      {},
      40000,
    );
    // One failed manifest request, as the spec asks. Three in a row exceed
    // HLS.js 1.7's default playlist retries: plain HLS.js then raises a fatal
    // levelLoadError and stalls for good, with or without P2P, and the demo
    // does not restart loading after a fatal error.
    await phase("manifest error in A", { manifestFail: 1 }, {}, 25000);
    await phase("slow network in both", { delay: 800 }, { delay: 800 }, 30000);

    // Tracker sockets closed and refused for 30 s in A: open peer
    // connections must stay, and the sockets come back.
    const beforeWs = await inAll(count, "faultState", [], "faults.js");
    dropTrackers(30000);
    const mark = window.__F.wsMark;
    await sleep(50000);
    const afterWs = await inAll(count, "faultState", [], "faults.js");
    log({
      phase: "trackers dropped in A",
      rows: rows(afterWs, beforeWs, meA),
      attempts: wsAttempts(mark),
    });

    // A tracker that does not exist: HTTP only, a reconnect delay that grows.
    const marks = await inAll(count, "wsMark", [], "faults.js");
    const beforeBad = await inAll(count, "faultState", [], "faults.js");
    await load(count, {
      player,
      streamUrl,
      swarmId: `rt-${tag}-badtracker`,
      trackers: "wss://tracker.p2pml-release-test.invalid",
    });
    await sleep(80000);
    const afterBad = await inAll(count, "faultState", [], "faults.js");
    log({
      phase: "unreachable tracker",
      rows: rows(afterBad, beforeBad, meA),
      attempts: await inAll(count, "wsAttemptsSince", [marks], "faults.js"),
    });
    await inAll(count, "restoreTrackers", [], "faults.js");
    return "done";
  });
}

/**
 * Segment faults only, each phase sure to inject: a phase with no fault
 * first, whose stalls are the baseline of the stream and the machine, then a
 * phase per mode with the fault in tab A. For comparing two builds, run it
 * on each with the same arguments.
 */
export function runSegmentFaults({
  count = 2,
  name = "segment-faults",
  player = "hlsjs_hls",
  streamUrl = S.HLS_LIVE,
  tag = `s${Date.now() % 100000}`,
  modes = ["503", "404", "hang"],
  segFail = 0.6,
  ms = 30000,
} = {}) {
  return background(name, async (log) => {
    const phase = await startFaultRun(count, { player, streamUrl, tag }, log);
    await phase("no fault", {}, {}, ms);
    for (const mode of modes) {
      await phase(`segment ${mode} in A`, { segFail, segMode: mode }, {}, ms);
    }
    return "done";
  });
}

export function wsMark() {
  return { me: window.__me, n: window.__F.ws.length };
}

export function wsAttemptsSince(marks) {
  const mark = marks.find((m) => m.me === window.__me)?.n ?? 0;
  return { me: window.__me, at: window.__F.ws.slice(mark).map((x) => x.at) };
}

export function restoreTrackers() {
  const q = new URLSearchParams(location.search);
  q.delete("trackers");
  history.pushState({}, "", `?${q.toString()}`);
  dispatchEvent(new PopStateEvent("popstate"));
  return true;
}

/**
 * A page without WebRTC: the demo in a same-origin iframe, its
 * RTCPeerConnection removed once the document leaves `loading` and before
 * the module scripts run. The run counts only where `WebRtc:unavailable`
 * moved; otherwise the removal came too late.
 */
export function runNoWebRtc({
  name = "no-webrtc",
  streamUrl = S.HLS_LIVE,
} = {}) {
  return background(name, async (log) => {
    const frame = document.createElement("iframe");
    frame.style.cssText =
      "width:480px;height:270px;position:fixed;right:0;bottom:0;z-index:9999";
    frame.src = `/?player=hlsjs_hls&swarmId=rt-nowebrtc-${Date.now() % 100000}&streamUrl=${encodeURIComponent(streamUrl)}`;
    document.body.appendChild(frame);
    let removed = null;
    const t0 = performance.now();
    while (performance.now() - t0 < 10000) {
      const d = frame.contentDocument;
      if (d && d.URL !== "about:blank" && d.readyState !== "loading") {
        const w = frame.contentWindow;
        removed = { readyState: d.readyState, had: typeof w.RTCPeerConnection };
        delete w.RTCPeerConnection;
        delete w.webkitRTCPeerConnection;
        w.RTCPeerConnection = undefined;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await sleep(5000);
    const w = frame.contentWindow;
    const v = w.document.querySelector("video");
    if (v) {
      v.muted = false;
      v.volume = 0.02;
      v.play().catch(() => undefined);
    }
    const samples = [];
    for (let k = 0; k < 4; k++) {
      await sleep(10000);
      const s = w.__p2pmlDiagnostics?.snapshot();
      const vv = w.document.querySelector("video");
      samples.push({
        rs: vv?.readyState,
        err: vv?.error?.code ?? null,
        t: vv ? +vv.currentTime.toFixed(1) : null,
        live: s?.live,
        counters:
          s &&
          Object.fromEntries(
            Object.entries(s.counters).filter(([k2]) =>
              /WebRtc|Download|PlayerRequest/.test(k2),
            ),
          ),
        anomalies: s?.anomalies,
      });
    }
    log({ removed, samples });
    frame.remove();
    return "done";
  });
}
