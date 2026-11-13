import { describe, expect, it } from "vitest";
import debug from "debug";
import { Core } from "../src/core.js";
import { diagnostics as compiledLedger } from "../src/diagnostics.js";
import { hlsManifestParser } from "../src/manifest/hls.js";
import { HLS_MASTER_WITH_AUDIO } from "./fixtures/index.js";

if (!compiledLedger) throw new Error("diagnostics are compiled out");
const ledger = compiledLedger;
// The ledger decides once, at its first record: on, for the whole file.
debug.enable("p2pml:diagnostics");
ledger.snapshot();

const MANIFEST_URL = "https://example.com/hls/master.m3u8";

const counter = (name: string) => ledger.snapshot()?.counters[name] ?? 0;

describe("stream registration counters", () => {
  it("counts each stream registered and each that fails to register", () => {
    const added = counter("StreamRegistration:added");
    const failed = counter("StreamRegistration:failed");

    const core = new Core({ manifestParsers: [hlsManifestParser] });
    core.processManifest({ url: MANIFEST_URL, data: HLS_MASTER_WITH_AUDIO });
    expect(counter("StreamRegistration:added")).toBe(added + 4);
    expect(counter("StreamRegistration:failed")).toBe(failed);

    // A builder that returns no usable ID: every stream fails to register.
    const failing = new Core({
      manifestParsers: [hlsManifestParser],
      streamIdBuilder: () => "",
    });
    failing.processManifest({ url: MANIFEST_URL, data: HLS_MASTER_WITH_AUDIO });
    expect(counter("StreamRegistration:added")).toBe(added + 4);
    expect(counter("StreamRegistration:failed")).toBe(failed + 4);

    failing.destroy();
    core.destroy();
    expect(ledger.snapshot()?.anomalies).toEqual([]);
  });
});
