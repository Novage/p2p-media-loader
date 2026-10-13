import { describe, expect, it } from "vitest";
import { segmentToStopFor } from "../src/p2p/loader.js";
import type { SegmentWithStream } from "../src/internal-types.js";

const segment = (id: string) => ({ runtimeId: id }) as SegmentWithStream;
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

  it("stops the first holder's download when every holder is busy", () => {
    // In a small swarm the one peer that holds the segment is often busy
    // with prefetch. Not stopping it would leave the urgent request on an
    // origin that has just failed.
    const first = segment("first");
    const second = segment("second");
    expect(
      segmentToStopFor([peer(true, first), peer(true, second)], wanted),
    ).toBe(first);
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
