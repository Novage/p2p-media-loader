import { describe, expect, it } from "vitest";
import {
  getDistanceFromPlayhead,
  isSegmentInTimeWindow,
} from "../src/utils/stream.js";

// A player 12 s ahead of the playhead whose buffer ends at manifest time 100:
// the playhead is at manifest time 88 without anyone ever saying so.
const playback = { bufferEdge: 100, bufferAhead: 12, rate: 1 };

describe("getDistanceFromPlayhead", () => {
  it("expresses a segment relative to the playhead using only differences", () => {
    expect(
      getDistanceFromPlayhead({ startTime: 100, endTime: 106 }, playback),
    ).toEqual({ start: 12, end: 18 });
    expect(
      getDistanceFromPlayhead({ startTime: 82, endTime: 88 }, playback),
    ).toEqual({ start: -6, end: 0 });
  });

  it("is invariant under a shift of the manifest timeline", () => {
    // Offsetting every manifest time by the same amount changes nothing —
    // this is what lets the manifest and player timelines never be compared.
    const shifted = { ...playback, bufferEdge: playback.bufferEdge + 5000 };
    expect(
      getDistanceFromPlayhead({ startTime: 5100, endTime: 5106 }, shifted),
    ).toEqual({ start: 12, end: 18 });
  });
});

describe("isSegmentInTimeWindow", () => {
  it("includes the segment under the playhead", () => {
    expect(
      isSegmentInTimeWindow({ startTime: 84, endTime: 90 }, playback, 15),
    ).toBe(true);
  });

  it("includes segments up to the window edge and excludes beyond", () => {
    // Window of 15 s from the playhead at 88 reaches manifest time 103.
    expect(
      isSegmentInTimeWindow({ startTime: 100, endTime: 106 }, playback, 15),
    ).toBe(true);
    expect(
      isSegmentInTimeWindow({ startTime: 104, endTime: 110 }, playback, 15),
    ).toBe(false);
  });

  it("excludes segments entirely behind the playhead", () => {
    expect(
      isSegmentInTimeWindow({ startTime: 70, endTime: 76 }, playback, 15),
    ).toBe(false);
  });

  it("scales the window by the playback rate", () => {
    const fast = { ...playback, rate: 2 };
    expect(
      isSegmentInTimeWindow({ startTime: 110, endTime: 116 }, fast, 15),
    ).toBe(true);
  });

  it("collapses the window to the playhead at rate 0", () => {
    const paused = { ...playback, rate: 0 };
    expect(
      isSegmentInTimeWindow({ startTime: 84, endTime: 90 }, paused, 15),
    ).toBe(true);
    expect(
      isSegmentInTimeWindow({ startTime: 90, endTime: 96 }, paused, 15),
    ).toBe(false);
  });
});
