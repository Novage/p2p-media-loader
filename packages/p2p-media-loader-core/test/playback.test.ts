import { describe, expect, it } from "vitest";
import {
  getBufferAhead,
  getPlaybackStateFromMediaElement,
} from "../src/playback.js";

describe("getBufferAhead", () => {
  it("measures from the range containing the playhead", () => {
    expect(getBufferAhead([{ start: 0, end: 30 }], 10)).toBe(20);
  });

  it("is zero when the playhead sits in a gap", () => {
    const ranges = [
      { start: 0, end: 10 },
      { start: 20, end: 40 },
    ];
    expect(getBufferAhead(ranges, 15)).toBe(0);
  });

  it("ignores later islands the playhead is not in", () => {
    // After a seek across a gap the last range may be far ahead; only the
    // containing one describes what is playable from here.
    const ranges = [
      { start: 0, end: 12 },
      { start: 100, end: 160 },
    ];
    expect(getBufferAhead(ranges, 5)).toBe(7);
    expect(getBufferAhead(ranges, 130)).toBe(30);
  });

  it("treats range edges as inclusive and never goes negative", () => {
    expect(getBufferAhead([{ start: 0, end: 10 }], 10)).toBe(0);
    expect(getBufferAhead([{ start: 0, end: 10 }], 0)).toBe(10);
    expect(getBufferAhead([], 3)).toBe(0);
  });
});

describe("getPlaybackStateFromMediaElement", () => {
  const media = (
    ranges: [number, number][],
    currentTime: number,
    paused: boolean,
    playbackRate = 1,
  ) => ({
    currentTime,
    playbackRate,
    paused,
    buffered: {
      length: ranges.length,
      start: (i: number) => ranges[i][0],
      end: (i: number) => ranges[i][1],
    } as TimeRanges,
  });

  it("reads buffer ahead and rate", () => {
    expect(
      getPlaybackStateFromMediaElement(media([[0, 30]], 12, false, 1.5)),
    ).toEqual({ bufferAhead: 18, rate: 1.5 });
  });

  it("reports rate 0 while paused regardless of playbackRate", () => {
    // pause() does not zero playbackRate; the contract carries paused as rate 0.
    expect(
      getPlaybackStateFromMediaElement(media([[0, 30]], 12, true, 1)),
    ).toEqual({ bufferAhead: 18, rate: 0 });
  });
});
