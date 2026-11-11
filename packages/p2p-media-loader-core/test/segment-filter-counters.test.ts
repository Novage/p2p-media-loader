import { describe, expect, it } from "vitest";
import debug from "debug";
import { diagnostics as compiledLedger } from "../src/diagnostics.js";
import { ManifestRegistry } from "../src/manifest/registry.js";
import { hlsManifestParser } from "../src/manifest/hls.js";
import { dashStreamOfCount } from "./fixtures/index.js";

if (!compiledLedger) throw new Error("diagnostics are compiled out");
const ledger = compiledLedger;
// The ledger decides once, at its first record: on, for the whole file.
debug.enable("p2pml:diagnostics");
ledger.snapshot();

const counter = (name: string) => ledger.snapshot()?.counters[name] ?? 0;

describe("segmentFilter counters", () => {
  it("counts each segment kept off P2P once, however often a refresh lists it", () => {
    const filtered = counter("Segment:filtered");
    const failed = counter("Segment:filter-failed");
    const registry = new ManifestRegistry(
      ({ url }) => !url.endsWith("v-1.m4s"),
    );
    registry.apply(dashStreamOfCount(2));
    registry.apply(dashStreamOfCount(3));
    expect(counter("Segment:filtered")).toBe(filtered + 1);
    expect(counter("Segment:filter-failed")).toBe(failed);
  });

  it("counts a segment one playlist lists twice once", () => {
    const filtered = counter("Segment:filtered");
    const media = `#EXTM3U
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-CUE-OUT:8
#EXTINF:4,
slate.ts
#EXT-X-CUE-OUT-CONT:4/8
#EXTINF:4,
slate.ts
`;
    const registry = new ManifestRegistry(
      ({ hls }) => hls?.cueOut === undefined && hls?.cueOutCont === undefined,
    );
    registry.apply(
      hlsManifestParser.parse(media, "https://cdn.example/live/index.m3u8"),
    );
    expect(counter("Segment:filtered")).toBe(filtered + 1);
  });

  it("counts a filter that throws, once for each segment", () => {
    const filtered = counter("Segment:filtered");
    const failed = counter("Segment:filter-failed");
    const registry = new ManifestRegistry(() => {
      throw new Error("broken filter");
    });
    registry.apply(dashStreamOfCount(2));
    registry.apply(dashStreamOfCount(2));
    expect(counter("Segment:filter-failed")).toBe(failed + 2);
    expect(counter("Segment:filtered")).toBe(filtered);
    expect(ledger.snapshot()?.anomalies).toEqual([]);
  });
});
