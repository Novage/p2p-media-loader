import { describe, expect, it } from "vitest";
import type { ProcessedManifest } from "p2p-media-loader-core";
import { liveDelayFor } from "../src/live-delay.js";

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
