import { describe, expect, it } from "vitest";
import { isSegmentInTimeWindow } from "../src/utils/stream.js";

// The player last requested the segment starting at manifest time 100. The
// windows are measured from there, never from a playhead.
const playback = { position: 100, rate: 1 };

describe("isSegmentInTimeWindow", () => {
  it("includes the requested segment", () => {
    expect(
      isSegmentInTimeWindow({ startTime: 100, endTime: 106 }, playback, 15),
    ).toBe(true);
  });

  it("includes segments up to the window edge and excludes beyond", () => {
    // A window of 15 s from the position at 100 reaches manifest time 115.
    expect(
      isSegmentInTimeWindow({ startTime: 112, endTime: 118 }, playback, 15),
    ).toBe(true);
    expect(
      isSegmentInTimeWindow({ startTime: 116, endTime: 122 }, playback, 15),
    ).toBe(false);
  });

  it("excludes segments entirely behind the position", () => {
    expect(
      isSegmentInTimeWindow({ startTime: 88, endTime: 94 }, playback, 15),
    ).toBe(false);
  });

  it("scales the window by the playback rate", () => {
    const fast = { ...playback, rate: 2 };
    expect(
      isSegmentInTimeWindow({ startTime: 124, endTime: 130 }, fast, 15),
    ).toBe(true);
  });

  it("is invariant under a shift of the manifest timeline", () => {
    // Both sides are manifest time, so offsetting every one of them by the
    // same amount changes nothing.
    const shifted = { ...playback, position: playback.position + 5000 };
    expect(
      isSegmentInTimeWindow({ startTime: 5112, endTime: 5118 }, shifted, 15),
    ).toBe(true);
    expect(
      isSegmentInTimeWindow({ startTime: 5116, endTime: 5122 }, shifted, 15),
    ).toBe(false);
  });
});
