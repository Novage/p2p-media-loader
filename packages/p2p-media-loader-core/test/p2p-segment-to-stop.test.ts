import { describe, expect, it } from "vitest";
import { segmentToStopFor } from "../src/p2p/loader.js";
import type { SegmentWithStream } from "../src/internal-types.js";

const segment = (id: string, startTime = 0) =>
  ({ runtimeId: id, startTime }) as SegmentWithStream;
const wanted = segment("wanted");

/** A peer that holds `holds` and downloads `downloading`, if anything. */
const peer = (holds: boolean, downloading?: SegmentWithStream) => ({
  getSegmentStatus: (s: SegmentWithStream) =>
    holds && s === wanted ? ("loaded" as const) : undefined,
  downloadingSegment: downloading,
});

describe("segmentToStopFor", () => {
  // The urgent request's P2P attempt needs a peer that holds the whole
  // segment and is free to send it. A peer downloads one segment at a time.

  it("stops nothing while a peer that holds the segment is free", () => {
    const busy = segment("busy");
    expect(
      segmentToStopFor([peer(true, busy), peer(true)], wanted),
    ).toBeUndefined();
  });

  it("stops a holder's download when every holder is busy", () => {
    // In a small swarm the one peer that holds the segment is often busy
    // with prefetch. Not stopping it would leave the urgent request on an
    // origin that has just failed.
    const busy = segment("busy");
    expect(segmentToStopFor([peer(true, busy)], wanted)).toBe(busy);
  });

  it("stops the download furthest ahead when every holder is busy", () => {
    // The nearer one is likely the next segment the player asks for:
    // stopped, its request could become urgent in turn.
    const next = segment("next", 4);
    const later = segment("later", 24);
    expect(
      segmentToStopFor([peer(true, next), peer(true, later)], wanted),
    ).toBe(later);
  });

  it("stops nothing when no peer holds the segment", () => {
    // A busy peer that does not hold it would not send it once free.
    expect(
      segmentToStopFor([peer(false, segment("other")), peer(false)], wanted),
    ).toBeUndefined();
  });

  it("stops nothing with no peers", () => {
    expect(segmentToStopFor([], wanted)).toBeUndefined();
  });
});
