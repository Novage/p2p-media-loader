import { describe, expect, it, vi } from "vitest";
import debug from "debug";

// A browser with WebRTC switched off has none from the start, so the core
// reads it once, as the module loads.
vi.mock(
  "../src/webtorrent/webtorrent-client/webrtc-utils.js",
  async (load) => ({
    ...(await load<
      typeof import("../src/webtorrent/webtorrent-client/webrtc-utils.js")
    >()),
    isWebRtcAvailable: false,
  }),
);

import { Core } from "../src/core.js";
import { hlsManifestParser } from "../src/manifest/hls.js";
import { diagnostics as compiledLedger } from "../src/diagnostics.js";
import { HLS_LIVE_NO_PDT_REFRESH_1 } from "./fixtures/index.js";

// Absent only in a prebuilt bundle; the tests run on the source.
if (!compiledLedger) throw new Error("diagnostics are compiled out");
const ledger = compiledLedger;
// The ledger decides once, at its first record: on, for the whole file.
debug.enable("p2pml:diagnostics");
ledger.snapshot();
debug.disable();
const count = (name: string) => ledger.snapshot()?.counters[name] ?? 0;

describe("Core on a page without WebRTC", () => {
  it("serves no segment, so the player loads alone and no tracker opens", () => {
    const unavailable = count("WebRtc:unavailable");
    const core = new Core({ manifestParsers: [hlsManifestParser] });
    core.processManifest({
      url: "https://cdn.example/live/index.m3u8",
      data: HLS_LIVE_NO_PDT_REFRESH_1,
    });

    const segment = "https://cdn.example/live/seg100.ts";
    expect(core.isSegmentLoadable(segment)).toBe(false);
    expect(core.isSegmentLoadable(segment)).toBe(false);
    // Said once per core, not once per request.
    expect(count("WebRtc:unavailable")).toBe(unavailable + 1);
    core.destroy();
  });
});
