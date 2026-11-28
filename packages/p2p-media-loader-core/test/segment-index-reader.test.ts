import { describe, expect, it } from "vitest";
import debug from "debug";
import { Core } from "../src/core.js";
import { diagnostics as compiledLedger } from "../src/diagnostics.js";
import { dashManifestParser } from "../src/manifest/dash.js";
import {
  ANGEL_ONE_AUDIO_EN_URL,
  ANGEL_ONE_MPD_URL,
  readBinaryFixture,
  readFixture,
} from "./fixtures/index.js";

if (!compiledLedger) throw new Error("diagnostics are compiled out");
const ledger = compiledLedger;
// The ledger decides once, at its first record: on, for the whole file.
debug.enable("p2pml:diagnostics");
ledger.snapshot();

const counter = (name: string) => ledger.snapshot()?.counters[name] ?? 0;

const INDEX_RANGE = { start: 786, end: 1009 };

describe("reading an external segment index", () => {
  it("counts each read by its result", () => {
    const core = new Core({ manifestParsers: [dashManifestParser] });
    core.processManifest({
      url: ANGEL_ONE_MPD_URL,
      data: readFixture("angel-one.mpd"),
    });
    const noBox = counter("SegmentIndex:no-box");
    const succeed = counter("SegmentIndex:read-succeed");

    core.processSegmentIndex({
      url: ANGEL_ONE_AUDIO_EN_URL,
      byteRange: INDEX_RANGE,
      data: new Uint8Array(10),
    });
    expect(counter("SegmentIndex:no-box")).toBe(noBox + 1);

    core.processSegmentIndex({
      url: ANGEL_ONE_AUDIO_EN_URL,
      byteRange: INDEX_RANGE,
      data: readBinaryFixture("angel-one-audio-en.sidx"),
    });
    expect(counter("SegmentIndex:read-succeed")).toBe(succeed + 1);
    core.destroy();
  });

  it("leaves the index without P2P when the reader throws, and throws nothing into the adapter", () => {
    // An integrator's own parser, whose reader fails on a truncated response.
    const core = new Core({
      manifestParsers: [
        {
          ...dashManifestParser,
          parseSegmentIndex: () => {
            throw new RangeError(
              "Offset is outside the bounds of the DataView",
            );
          },
        },
      ],
    });
    core.processManifest({
      url: ANGEL_ONE_MPD_URL,
      data: readFixture("angel-one.mpd"),
    });
    const failed = counter("SegmentIndex:read-failed");

    expect(
      core.processSegmentIndex({
        url: ANGEL_ONE_AUDIO_EN_URL,
        byteRange: INDEX_RANGE,
        data: new Uint8Array(10),
      }),
    ).toBeUndefined();
    expect(counter("SegmentIndex:read-failed")).toBe(failed + 1);
    // The stream still waits for its index: a later response can resolve it.
    expect(core.isSegmentIndex(ANGEL_ONE_AUDIO_EN_URL, INDEX_RANGE)).toBe(true);

    core.destroy();
    expect(ledger.snapshot()?.open).toEqual([]);
    expect(ledger.snapshot()?.anomalies).toEqual([]);
  });
});
