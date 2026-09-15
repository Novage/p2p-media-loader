import { describe, expect, it } from "vitest";
import { generateQueue } from "../src/utils/queue.js";
import { Core } from "../src/core.js";
import type {
  Playback,
  SegmentWithStream,
  StreamWithSegments,
} from "../src/internal-types.js";
import type { P2PLoader } from "../src/p2p/loader.js";

const SEGMENT_DURATION = 8;

function createStream(): StreamWithSegments {
  return {
    runtimeId: "https://cdn.example/v/720p",
    type: "main",
    properties: { bitrate: 1_000_000 },
    swarmId: "https://cdn.example/v/master.mpd",
    identityHash: "id",
    streamSwarmId: "v3-swarm-main-id",
    infoHash: "hash",
    segments: new Map<string, SegmentWithStream>(),
  } as StreamWithSegments;
}

/**
 * Makes the stream hold exactly the `count` segments from `from`, the way a
 * manifest refresh makes the registry mirror the window it just read.
 */
function window(stream: StreamWithSegments, from: number, count: number) {
  stream.segments.clear();
  for (let i = from; i < from + count; i++) {
    const runtimeId = `seg-${i}`;
    stream.segments.set(runtimeId, {
      runtimeId,
      externalId: i,
      url: `https://cdn.example/v/720p/${i}.m4s`,
      startTime: i * SEGMENT_DURATION,
      endTime: (i + 1) * SEGMENT_DURATION,
      stream,
    });
  }
  return stream;
}

/** Nobody is announcing anything; only the time windows decide. */
const noPeers = {
  isSegmentLoadingOrLoadedBySomeone: () => false,
} as unknown as P2PLoader;

const config = {
  ...Core.DEFAULT_STREAM_CONFIG,
  highDemandTimeWindow: 15,
  httpDownloadTimeWindow: 3000,
  p2pDownloadTimeWindow: 6000,
};

const playbackAt = (segment: SegmentWithStream): Playback => ({
  bufferEdge: segment.endTime,
  bufferAhead: 10,
  rate: 1,
  source: "reported",
});

function queueOf(anchor: SegmentWithStream, playback: Playback) {
  return Array.from(
    generateQueue(anchor, playback, config, noPeers, 100),
    (item) => item.segment.runtimeId,
  );
}

describe("generateQueue over a rolling live window", () => {
  it("starts at the segment the player last requested", () => {
    const stream = window(createStream(), 0, 8);
    const anchor = stream.segments.get("seg-2")!;
    expect(queueOf(anchor, playbackAt(anchor))).toEqual([
      "seg-2",
      "seg-3",
      "seg-4",
      "seg-5",
      "seg-6",
      "seg-7",
    ]);
  });

  it("resumes from the oldest segment left when the window rolls past the anchor", () => {
    // The player loaded without core for a while — its requests missed the
    // registry, or it stopped fetching with a full buffer — and the window has
    // since dropped the segment the queue was anchored on.
    const stream = window(createStream(), 0, 8);
    const anchor = stream.segments.get("seg-2")!;
    const playback = playbackAt(anchor);
    window(stream, 6, 8);

    const queue = queueOf(anchor, playback);
    expect(queue[0]).toBe("seg-6");
    expect(queue).toHaveLength(8);
  });

  it("does not resume behind the anchor", () => {
    // Every segment left ends before the one the player asked for begins:
    // there is no plausible resume point, so the queue stays empty.
    const stream = window(createStream(), 20, 4);
    const anchor = stream.segments.get("seg-20")!;
    const playback = playbackAt(anchor);
    window(stream, 0, 8);

    expect(queueOf(anchor, playback)).toEqual([]);
  });
});
