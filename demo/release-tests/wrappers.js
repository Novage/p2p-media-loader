// Test 13, player wrappers (specs/release-testing.md). Each step plays one
// wrapper in every tab, then moves the other tabs to the raw engine behind
// it, in the same swarm. A wrapper passes when its visible video plays from
// a `blob:` URL (MSE, not native HLS) and its requests reach the core.

import {
  STREAMS as S,
  background,
  go,
  inAll,
  inOthers,
  load,
  play,
  settle,
  sleep,
  state,
  stepRows,
  video,
} from "./lib.js";

/* global window, document */

/** Every wrapper of the demo, with the raw engine it is built on. */
export function defaultSteps() {
  return [
    { p: "videojs10_hls", raw: "hlsjs_hls", u: S.HLS_LIVE },
    { p: "dplayer_hls", raw: "hlsjs_hls", u: S.HLS_LIVE },
    { p: "clappr_hls", raw: "hlsjs_hls", u: S.HLS_LIVE },
    { p: "openPlayer_hls", raw: "hlsjs_hls", u: S.HLS_LIVE },
    { p: "mediaElement_hls", raw: "hlsjs_hls", u: S.HLS_LIVE },
    { p: "videojs10_dashjs", raw: "dashjs", u: S.TP8 },
    { p: "dplayer_shaka", raw: "shaka", u: S.TP8 },
    { p: "clappr_shaka", raw: "shaka", u: S.TP8 },
    { p: "dplayer_dashjs", raw: "dashjs", u: S.TP8 },
    { p: "mediaElement_dashjs", raw: "dashjs", u: S.TP8 },
  ];
}

/**
 * Starts the player: Clappr does not autoplay, so its own play button is
 * clicked; every other player plays through the driver.
 */
export function start() {
  const button = document.querySelector(
    "#clappr-player [data-playpause], #clappr-player .play-wrapper",
  );
  if (button && video()?.paused) button.click();
  return play();
}

/** How this tab plays: every video's source kind, and native HLS support. */
export function media() {
  const s = state();
  return {
    me: window.__me,
    native: video()?.canPlayType("application/vnd.apple.mpegurl") ?? "",
    blob: s.blob,
    videos: [...document.querySelectorAll("video")].map((v) => ({
      w: v.clientWidth,
      src: (v.currentSrc || v.src || "").slice(0, 60),
    })),
    requests: s.counters["PlayerRequest:succeed"] ?? 0,
  };
}

async function phase(count, label, before, holdMs, keepsPlayer = false) {
  const settledMs = await settle(count, 40000);
  await sleep(holdMs);
  const after = await inAll(count, "readTab");
  const m = await inAll(count, "media", [], "wrappers.js");
  const rows = stepRows(
    after,
    before,
    Object.fromEntries(
      after.map((a) => [
        a.me,
        {
          probe: a.probe,
          media: m.find((x) => x?.me === a.me),
          requests:
            (a.counters["PlayerRequest:succeed"] ?? 0) -
            (before.find((b) => b?.me === a.me)?.counters?.[
              "PlayerRequest:succeed"
            ] ?? 0),
        },
      ]),
    ),
  );
  // A tab that kept its player keeps its records open by design: they are
  // no leak of the phase before
  if (keepsPlayer) {
    for (const r of rows) if (r.me === window.__me) r.leaked = [];
  }
  return { label, settledMs, rows };
}

export function run({
  steps = defaultSteps(),
  count = 2,
  holdMs = 20000,
  name = "wrappers",
  tag = `w${Date.now() % 100000}`,
} = {}) {
  return background(name, async (log) => {
    for (let i = 0; i < steps.length; i++) {
      const { p, raw, u } = steps[i];
      const swarmId = `rt-${tag}-${i}`;
      const s0 = await inAll(count, "state");
      await load(count, { player: p, streamUrl: u, swarmId });
      await inAll(count, "start", [], "wrappers.js");
      const same = await phase(count, "same", s0, holdMs);
      const s1 = await inAll(count, "state");
      await inOthers(count, "go", [{ player: raw, streamUrl: u, swarmId }]);
      await sleep(5000);
      await inOthers(count, "play");
      const mixed = await phase(count, `others ${raw}`, s1, holdMs, true);
      log({ i, p, raw, u: u.split("/").slice(-2).join("/"), same, mixed });
    }
    go({ player: "hlsjs_hls" });
    return "done";
  });
}

/** One line per tab and phase. */
export function summarize(entries) {
  return entries.map((e) => ({
    step: `${e.i} ${e.p} / ${e.raw} ${e.u}`,
    phases: [e.same, e.mixed].map(
      (ph) =>
        `${ph.label} settled=${ph.settledMs}: ` +
        ph.rows
          .map(
            (r) =>
              `rs${r.rs} e${r.err} lag${r.lag} blob${r.media?.blob} native'${r.media?.native}' req${r.requests} held${JSON.stringify(r.held)} http${r.http}/p2p${r.p2p} loaders${JSON.stringify(r.loaders)} leak${r.leaked.length} an${r.anomalies.length} miss${r.probe?.misses} err${r.probe?.errors}${r.probe?.errors ? ":" + r.probe.errorSample.join(" / ") : ""}`,
          )
          .join(" | "),
    ),
  }));
}
