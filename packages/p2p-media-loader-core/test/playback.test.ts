import { describe, expect, it, vi } from "vitest";
import {
  getBufferAhead,
  getPlaybackStateFromMediaElement,
  trackMediaElementPlayback,
} from "../src/playback.js";
import debug from "debug";
import { Core } from "../src/core.js";
import { diagnostics as compiledLedger } from "../src/diagnostics.js";

// Absent only in a prebuilt bundle; the tests run on the source.
if (!compiledLedger) throw new Error("diagnostics are compiled out");
const ledger = compiledLedger;
// The ledger decides once, at its first record: on, for the whole file.
debug.enable("p2pml:diagnostics");
ledger.snapshot();
debug.disable();
const count = (name: string) => ledger.snapshot()?.counters[name] ?? 0;

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

describe("trackMediaElementPlayback", () => {
  /** Enough of a media element to add listeners to and dispatch on. */
  function fakeMedia() {
    const listeners = new Map<string, Set<EventListener>>();
    const media = {
      currentTime: 10,
      playbackRate: 1,
      paused: false,
      buffered: {
        length: 1,
        start: () => 0,
        end: () => 25,
      } as TimeRanges,
      addEventListener(type: string, listener: EventListener) {
        (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(
          listener,
        );
      },
      removeEventListener(type: string, listener: EventListener) {
        listeners.get(type)?.delete(listener);
      },
    };
    const fire = (type: string) => {
      for (const listener of listeners.get(type) ?? []) {
        listener({ target: media, type } as unknown as Event);
      }
    };
    const count = () =>
      [...listeners.values()].reduce((total, set) => total + set.size, 0);
    return { media: media as unknown as HTMLMediaElement, fire, count };
  }

  it("reports the state after every event that can change it", () => {
    // The one list every adapter learns the buffer from.
    const { media, fire, count } = fakeMedia();
    const reported: number[] = [];
    trackMediaElementPlayback((state) =>
      reported.push(state.bufferAhead),
    ).watch(media);

    expect(count()).toBe(8);
    for (const event of [
      "timeupdate",
      "progress",
      "seeking",
      "seeked",
      "ratechange",
      "play",
      "pause",
      "waiting",
    ]) {
      fire(event);
    }
    expect(reported).toEqual(Array<number>(8).fill(15));
  });

  it("counts every seek into the state it reports, across elements", () => {
    // A count, so that a seek that began and ended between two reports still
    // shows; a new element continues it rather than starting again.
    const first = fakeMedia();
    const second = fakeMedia();
    const counts: (number | undefined)[] = [];
    const tracker = trackMediaElementPlayback((state) =>
      counts.push(state.seekCount),
    );
    tracker.watch(first.media);
    first.fire("timeupdate");
    first.fire("seeking");
    first.fire("seeked");
    first.fire("seeking");
    tracker.watch(second.media);
    second.fire("seeking");
    expect(counts).toEqual([0, 1, 1, 2, 3]);
  });

  it("stops reporting, and stops twice without complaint", () => {
    const { media, fire, count } = fakeMedia();
    const report = vi.fn();
    const tracker = trackMediaElementPlayback(report);
    tracker.watch(media);

    tracker.stop();
    expect(count()).toBe(0);
    tracker.stop();
    fire("timeupdate");
    expect(report).not.toHaveBeenCalled();
  });

  it("watches one element at a time, and re-watching the same one changes nothing", () => {
    const first = fakeMedia();
    const second = fakeMedia();
    const report = vi.fn();
    const tracker = trackMediaElementPlayback(report);

    tracker.watch(first.media);
    tracker.watch(first.media);
    expect(first.count()).toBe(8);

    // A player that attached a new element: the old one is let go.
    tracker.watch(second.media);
    expect(first.count()).toBe(0);
    expect(second.count()).toBe(8);

    first.fire("timeupdate");
    expect(report).not.toHaveBeenCalled();
    second.fire("timeupdate");
    expect(report).toHaveBeenCalledTimes(1);
  });
});

describe("Core.updatePlayback", () => {
  it("counts each seek the player reports, not the first count it sees", () => {
    const before = count("Seek:reported");
    const core = new Core();
    core.updatePlayback({ bufferAhead: 0, rate: 1 });
    core.updatePlayback({ bufferAhead: 0, rate: 1, seekCount: 3 });
    core.updatePlayback({ bufferAhead: 5, rate: 1, seekCount: 3 });
    core.updatePlayback({ bufferAhead: 0, rate: 1, seekCount: 4 });
    core.updatePlayback({ bufferAhead: 0, rate: 1, seekCount: 6 });
    expect(count("Seek:reported")).toBe(before + 2);
    core.destroy();
  });
});
