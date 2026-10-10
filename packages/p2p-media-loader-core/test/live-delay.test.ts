import { describe, expect, it } from "vitest";
import type { ProcessedManifest } from "../src/index.js";
import {
  urgentBufferThresholdFor,
  liveDelayFor,
  liveDelayForSegments,
  maxLiveLatencyFor,
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
    // window, segment, delay, player buffer, urgency threshold
    [4, 5, 15, 10, 5], // the four-segment HLS playlist
    [75, 4, 60, 56, 15], // a typical DASH window, capped at a minute
    [6, 2, 10, 8, 4], // short segments
    [3, 2, 4, 4, 2], // a window with no room: the buffer floor wins
    [2, 2, 2, 4, 2], // the floor reaches past the delay itself
  ])(
    "%d × %d s: delay %d, buffer %d, threshold %d",
    (count, seconds, delay, buffer, threshold) => {
      const target = liveDelayForSegments(segments(count, seconds));
      expect(target).toEqual({ delay, segment: seconds });
      expect(playerBufferFor(target!)).toBe(buffer);
      expect(urgentBufferThresholdFor(undefined, target)).toBe(threshold);
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

  it("gives VOD the default urgency threshold", () => {
    expect(urgentBufferThresholdFor(undefined, undefined)).toBe(15);
  });

  it("takes a configured threshold as it is off live", () => {
    expect(urgentBufferThresholdFor(30, undefined)).toBe(30);
    expect(urgentBufferThresholdFor(0, undefined)).toBe(0);
  });

  it("lets a configured threshold lower the live one", () => {
    // Lower leaves peers more room, which is the direction that helps.
    expect(urgentBufferThresholdFor(3, { delay: 15, segment: 5 })).toBe(3);
    expect(urgentBufferThresholdFor(0, { delay: 15, segment: 5 })).toBe(0);
  });

  it("never lets a configured threshold reach past half the player's buffer", () => {
    // The v4 default, kept through an upgrade on a four-segment playlist:
    // a 15 s threshold over a player that buffers 10 s makes every request
    // urgent, so no segment would ever be left for the election.
    const tight = { delay: 15, segment: 5 };
    expect(playerBufferFor(tight)).toBe(10);
    expect(urgentBufferThresholdFor(15, tight)).toBe(5);
    expect(urgentBufferThresholdFor(30, tight)).toBe(5);

    // On a window with room to spare the configured number stands.
    const wide = { delay: 60, segment: 4 };
    expect(playerBufferFor(wide)).toBe(56);
    expect(urgentBufferThresholdFor(15, wide)).toBe(15);
  });

  it("keeps the threshold at most half the player's buffer for every configuration", () => {
    for (const [count, seconds] of [
      [4, 5],
      [6, 2],
      [75, 4],
      [3, 2],
    ]) {
      const target = liveDelayForSegments(segments(count, seconds))!;
      const buffer = playerBufferFor(target);
      for (const configured of [undefined, 0, 3, 15, 30, 600]) {
        expect(
          urgentBufferThresholdFor(configured, target),
        ).toBeLessThanOrEqual(buffer / 2);
      }
    }
  });

  it("re-syncs two segments past the delay", () => {
    expect(maxLiveLatencyFor({ delay: 15, segment: 5 })).toBe(25);
    expect(maxLiveLatencyFor({ delay: 60, segment: 4 })).toBe(68);
  });

  it("re-syncs while the player's buffer still ends inside the window", () => {
    // A paused player's buffer ends a buffer length ahead of its playhead.
    // At the re-sync threshold that end must still be in the window, or the
    // player's next request is for a segment the registry no longer lists.
    for (const [count, seconds] of [
      [4, 5],
      [6, 2],
      [75, 4],
      [3, 2],
      [2, 2],
    ]) {
      const target = liveDelayForSegments(segments(count, seconds))!;
      const bufferEnd = maxLiveLatencyFor(target) - playerBufferFor(target);
      expect(bufferEnd).toBeLessThanOrEqual(count * seconds);
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

  it("places by the window the manifest declares, whatever the span of the moment", () => {
    // A 60 s DASH window of 8 s segments lists 7 or 8 of them, a 56 s or a
    // 64 s span, by the moment of the parse. The declared window gives one
    // placement for both, a segment inside it.
    for (const [end, segmentCount] of [
      [1056, 7],
      [1064, 8],
    ]) {
      const target = liveDelayFor({
        streams: [stream({ end, segmentCount, declaredWindow: 60 })],
      });
      expect(target).toEqual({ delay: 52, segment: 8 });
    }
    expect(liveDelayForSegments(segments(7, 8), 60)).toEqual({
      delay: 52,
      segment: 8,
    });
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
