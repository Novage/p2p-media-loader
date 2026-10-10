import { describe, expect, it } from "vitest";
import { PlaybackTracker } from "../src/playback-tracker.js";

function tracker() {
  let clock = 0;
  const t = new PlaybackTracker(() => clock);
  return {
    t,
    advance: (seconds: number) => {
      clock += seconds * 1000;
    },
  };
}

describe("PlaybackTracker", () => {
  it("takes a player that has not reported as one with nothing buffered", () => {
    const { t } = tracker();
    expect(t.bufferAhead()).toBe(0);
    expect(t.rate()).toBe(1);
  });

  it("gives the reported buffer at the moment of the report", () => {
    const { t } = tracker();
    t.report({ bufferAhead: 12, rate: 1 });
    expect(t.bufferAhead()).toBe(12);
  });

  it("ages a report by what the player consumes at its rate", () => {
    const { t, advance } = tracker();
    t.report({ bufferAhead: 12, rate: 2 });
    advance(3);
    expect(t.bufferAhead()).toBe(6);
  });

  it("never ages a report below zero, so a frozen report ends urgent", () => {
    const { t, advance } = tracker();
    t.report({ bufferAhead: 12, rate: 1 });
    advance(60);
    expect(t.bufferAhead()).toBe(0);
  });

  it("does not age a paused report: a paused player consumes nothing", () => {
    const { t, advance } = tracker();
    t.report({ bufferAhead: 12, rate: 0 });
    advance(600);
    expect(t.bufferAhead()).toBe(12);
  });

  it("replaces the last report with the next", () => {
    const { t, advance } = tracker();
    t.report({ bufferAhead: 12, rate: 1 });
    advance(5);
    t.report({ bufferAhead: 20, rate: 1 });
    expect(t.bufferAhead()).toBe(20);
  });

  it("ages a report made before it was taken from when it was made", () => {
    // A loader created after the report starts from it, aged since then.
    let clock = 10_000;
    const t = new PlaybackTracker(() => clock);
    t.report({ bufferAhead: 12, rate: 1 }, 6_000);
    expect(t.bufferAhead()).toBe(8);
    clock += 1000;
    expect(t.bufferAhead()).toBe(7);
  });

  it("sizes by the last non-zero rate, and says when that changes", () => {
    const { t } = tracker();
    expect(t.report({ bufferAhead: 5, rate: 1 })).toBe(false);
    expect(t.report({ bufferAhead: 5, rate: 2 })).toBe(true);
    expect(t.rate()).toBe(2);
    // Paused: the windows keep the rate the player played at.
    expect(t.report({ bufferAhead: 5, rate: 0 })).toBe(false);
    expect(t.rate()).toBe(2);
    expect(t.report({ bufferAhead: 5, rate: 2 })).toBe(false);
  });
});
