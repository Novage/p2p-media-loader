import { describe, expect, it } from "vitest";
import type { ProcessedManifest } from "../src/index.js";
import {
  highDemandWindowFor,
  liveDelayFor,
  liveDelayForSegments,
  playerBufferFor,
} from "../src/live-delay.js";

/** A live window of `count` segments of `seconds` each, from `start`. */
const segments = (count: number, seconds: number, start = 1000) =>
  Array.from({ length: count }, (_, i) => ({
    startTime: start + i * seconds,
    endTime: start + (i + 1) * seconds,
  }));

describe("live window geometry", () => {
  it.each([
    // window, segment, delay, player buffer, high-demand
    [4, 5, 15, 10, 5], // the four-segment HLS playlist
    [75, 4, 60, 56, 15], // a typical DASH window, capped at a minute
    [6, 2, 10, 8, 4], // short segments
    [3, 2, 4, 4, 2], // a window with no room: the buffer floor wins
    [2, 2, 2, 4, 2], // the floor reaches past the delay itself
  ])(
    "%d × %d s: delay %d, buffer %d, high-demand %d",
    (count, seconds, delay, buffer, highDemand) => {
      const target = liveDelayForSegments(segments(count, seconds));
      expect(target).toEqual({ delay, segment: seconds });
      expect(playerBufferFor(target!)).toBe(buffer);
      expect(highDemandWindowFor(undefined, target)).toBe(highDemand);
    },
  );

  it("measures the window from the earliest start to the latest end, in any order", () => {
    const target = liveDelayForSegments(segments(4, 5).reverse());
    expect(target).toEqual({ delay: 15, segment: 5 });
  });

  it("has no placement for a stream with no segments or no length", () => {
    expect(liveDelayForSegments([])).toBeUndefined();
    expect(
      liveDelayForSegments([{ startTime: 10, endTime: 10 }]),
    ).toBeUndefined();
  });

  it("gives VOD the default high-demand window", () => {
    expect(highDemandWindowFor(undefined, undefined)).toBe(15);
  });

  it("takes a configured window as it is off live", () => {
    expect(highDemandWindowFor(30, undefined)).toBe(30);
    expect(highDemandWindowFor(0, undefined)).toBe(0);
  });

  it("lets a configured window narrow the live one", () => {
    // Narrower leaves peers more room, which is the direction that helps.
    expect(highDemandWindowFor(3, { delay: 15, segment: 5 })).toBe(3);
    expect(highDemandWindowFor(0, { delay: 15, segment: 5 })).toBe(0);
  });

  it("never lets a configured window reach past half the player's buffer", () => {
    // The v4 default, kept through an upgrade on a four-segment playlist:
    // 15 s of urgency over a player that buffers 10 s covers everything it
    // fetches, so no segment would ever be left for the election.
    const tight = { delay: 15, segment: 5 };
    expect(playerBufferFor(tight)).toBe(10);
    expect(highDemandWindowFor(15, tight)).toBe(5);
    expect(highDemandWindowFor(30, tight)).toBe(5);

    // On a window with room to spare the configured number stands.
    const wide = { delay: 60, segment: 4 };
    expect(playerBufferFor(wide)).toBe(56);
    expect(highDemandWindowFor(15, wide)).toBe(15);
  });

  it("keeps the window inside the player's buffer for every configuration", () => {
    for (const [count, seconds] of [
      [4, 5],
      [6, 2],
      [75, 4],
      [3, 2],
    ]) {
      const target = liveDelayForSegments(segments(count, seconds))!;
      const buffer = playerBufferFor(target);
      for (const configured of [undefined, 0, 3, 15, 30, 600]) {
        expect(highDemandWindowFor(configured, target)).toBeLessThanOrEqual(
          buffer / 2,
        );
      }
    }
  });
});

const stream = (
  over: Partial<ProcessedManifest["streams"][number]>,
): ProcessedManifest["streams"][number] => ({
  key: "s",
  type: "main",
  isLive: true,
  start: 1000,
  end: 1028,
  segmentCount: 14,
  ...over,
});

describe("Shaka live presentation delay", () => {
  it("places the player one segment inside the tail", () => {
    // A 28 s window of 2 s segments: 26 s behind the edge.
    const target = liveDelayFor({ streams: [stream({})] });
    expect(target?.delay).toBe(26);
    expect(target?.segment).toBe(2);
  });

  it("caps the delay at a minute on a wide window", () => {
    const target = liveDelayFor({
      streams: [stream({ start: 0, end: 600, segmentCount: 100 })],
    });
    expect(target?.delay).toBe(60);
  });

  it("takes the widest live main stream and ignores the rest", () => {
    const target = liveDelayFor({
      streams: [
        stream({
          key: "audio",
          type: "secondary",
          start: 0,
          end: 600,
          segmentCount: 300,
        }),
        stream({
          key: "vod",
          isLive: false,
          start: 0,
          end: 600,
          segmentCount: 300,
        }),
        stream({ key: "v1", start: 1000, end: 1028, segmentCount: 14 }),
        stream({ key: "v2", start: 1000, end: 1060, segmentCount: 30 }),
      ],
    });
    expect(target?.delay).toBe(58);
  });

  it("places an audio-only presentation by the stream it has", () => {
    // Live radio: an MPD of audio Representations, typed secondary because
    // that is what an audio track is beside a video one.
    const target = liveDelayFor({
      streams: [
        stream({
          key: "audio",
          type: "secondary",
          start: 0,
          end: 60,
          segmentCount: 15,
        }),
      ],
    });
    expect(target).toEqual({ delay: 56, segment: 4 });
  });

  it("says nothing for a master playlist, a VOD, or an empty stream", () => {
    expect(liveDelayFor({ streams: [] })).toBeUndefined();
    expect(
      liveDelayFor({ streams: [stream({ isLive: false })] }),
    ).toBeUndefined();
    expect(
      liveDelayFor({ streams: [stream({ segmentCount: 0, end: 1000 })] }),
    ).toBeUndefined();
  });
});
