import { describe, expect, it } from "vitest";
import debug from "debug";
import { diagnostics as compiledLedger } from "../src/diagnostics.js";
import { ManifestRegistry } from "../src/manifest/registry.js";
import type { ParsedManifest } from "../src/manifest/types.js";
import { dashStreamOfTimes } from "./fixtures/index.js";

if (!compiledLedger) throw new Error("diagnostics are compiled out");
const ledger = compiledLedger;
// The ledger decides once, at its first record: on, for the whole file.
debug.enable("p2pml:diagnostics");
ledger.snapshot();

const counter = () =>
  ledger.snapshot()?.counters["Segment:unshared-too-short"] ?? 0;

const dash = dashStreamOfTimes;

describe("DASH segments left out for want of an ID", () => {
  it("counts each such segment once, however often a refresh lists it", () => {
    const before = counter();
    const registry = new ManifestRegistry();
    registry.apply(
      dash([
        [0, 4],
        [4, 0.04],
      ]),
    );
    expect(counter()).toBe(before + 1);

    // The refresh lists it again, and a new one.
    registry.apply(
      dash([
        [0, 4],
        [4, 0.04],
        [4.04, 3.96],
        [8, 0.02],
      ]),
    );
    expect(counter()).toBe(before + 2);
    expect(ledger.snapshot()?.anomalies).toEqual([]);
  });

  it("keeps and does not count a segment with no duration to judge", () => {
    // The whole file of a SegmentBase stream with no index range, in a live
    // MPD: the parser gives it no duration.
    const before = counter();
    const registry = new ManifestRegistry();
    registry.apply(dash([[0, Number.NaN]]));
    registry.apply(dash([[0, undefined as unknown as number]]));
    expect(registry.getStream("v")?.segments.size).toBe(1);
    expect(counter()).toBe(before);
  });

  it("reports two shared segments with one ID, once, without their URLs", () => {
    // Overlapping segments: both cross a unit boundary, and both start in
    // unit 0. Nothing in a valid manifest gives this; the check is for a
    // defect in how IDs are made. The URLs carry a signed token, which a
    // record must not show.
    const signed = (manifest: ParsedManifest): ParsedManifest => ({
      ...manifest,
      streams: manifest.streams.map((stream) => ({
        ...stream,
        segments: stream.segments?.map((segment) => ({
          ...segment,
          // A raw "|" in the query must not pass for a byte range.
          url: `${segment.url}?token=se|cret`,
        })),
      })),
    });
    ledger.clearAnomalies();
    const registry = new ManifestRegistry();
    registry.apply(
      signed(
        dash([
          [0, 4],
          [0.04, 4],
        ]),
      ),
    );
    expect(ledger.snapshot()?.anomalies).toEqual([
      "Registry segments v-0.m4s and v-1.m4s of stream v share ID 0",
    ]);
    // The refresh lists both again, and a new segment after them.
    registry.apply(
      signed(
        dash([
          [0, 4],
          [0.04, 4],
          [4.04, 4],
        ]),
      ),
    );
    expect(ledger.snapshot()?.anomalies).toHaveLength(1);
    ledger.clearAnomalies();
  });
});
