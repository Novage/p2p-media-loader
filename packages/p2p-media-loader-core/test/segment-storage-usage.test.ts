import { describe, expect, it } from "vitest";
import { SegmentMemoryStorage } from "../src/segment-storage/segment-memory-storage.js";
import { Core } from "../src/core.js";
import type { StreamConfig } from "../src/types.js";

const MiB = 1048576;
const SEGMENT_BYTES = MiB / 4;
const STREAM_SWARM_ID = "v3-swarm-main-hash";
const SWARM_ID = "https://cdn.example/v/master.m3u8";

async function initStorage(streamConfig: Partial<StreamConfig> = {}) {
  const storage = new SegmentMemoryStorage();
  await storage.initialize(
    { ...Core.DEFAULT_COMMON_CORE_CONFIG, segmentMemoryStorageLimit: 1 },
    { ...Core.DEFAULT_STREAM_CONFIG, ...streamConfig },
    { ...Core.DEFAULT_STREAM_CONFIG, ...streamConfig },
  );
  storage.setSegmentChangeCallback(() => undefined);
  return storage;
}

/** Three consecutive segments of a stream, stored as the loader would. */
async function createStorage(
  isLiveStream: boolean,
  streamConfig: Partial<StreamConfig> = {},
  segmentSeconds = 10,
) {
  const storage = await initStorage(streamConfig);
  storage.onPlaybackUpdated(0, 1);

  for (let index = 0; index < 3; index++) {
    const startTime = index * segmentSeconds;
    storage.onSegmentRequested(
      SWARM_ID,
      STREAM_SWARM_ID,
      index,
      startTime,
      startTime + segmentSeconds,
      "main",
      isLiveStream,
    );
    await storage.storeSegment(
      SWARM_ID,
      STREAM_SWARM_ID,
      index,
      new ArrayBuffer(SEGMENT_BYTES),
      startTime,
      startTime + segmentSeconds,
      "main",
      isLiveStream,
    );
  }

  return storage;
}

describe("SegmentMemoryStorage usage reporting", () => {
  it("counts the live trailing window eviction refuses to free", async () => {
    const storage = await createStorage(true);

    // Past the first segment by more than three of its lengths, and past the
    // second by less: the second one stays, so it occupies capacity.
    storage.onPlaybackUpdated(45, 1);

    expect(storage.getUsage()).toEqual({
      totalCapacity: 1,
      usedCapacity: (2 * SEGMENT_BYTES) / MiB,
    });
  });

  it("counts only what is ahead of the playhead on demand streams", async () => {
    const storage = await createStorage(false);

    storage.onPlaybackUpdated(28, 1);

    expect(storage.getUsage()).toEqual({
      totalCapacity: 1,
      usedCapacity: SEGMENT_BYTES / MiB,
    });
  });

  it("keeps a floor in seconds under the trailing window on short segments", async () => {
    // Three 2 s segments. Measured in segments alone the window would be 6 s,
    // narrower than the seconds the main and secondary timelines can differ
    // by, and the position is whichever loader reported last.
    const storage = await createStorage(true, {}, 2);

    // Ten seconds past the end of the first segment: inside the floor, so
    // all three are still held.
    storage.onPlaybackUpdated(12, 1);

    expect(storage.getUsage()).toEqual({
      totalCapacity: 1,
      usedCapacity: (3 * SEGMENT_BYTES) / MiB,
    });
  });

  it("keeps the trailing window in segments, whatever the high-demand window", async () => {
    // The high-demand window is sized for scheduling ahead of the playhead
    // and can be as short as a segment; retention behind it does not follow.
    const storage = await createStorage(true, { highDemandTimeWindow: 1 });

    storage.onPlaybackUpdated(45, 1);

    expect(storage.getUsage()).toEqual({
      totalCapacity: 1,
      usedCapacity: (2 * SEGMENT_BYTES) / MiB,
    });
  });

  it("reports as occupied exactly what eviction leaves behind", async () => {
    const storage = await createStorage(true);
    storage.onPlaybackUpdated(45, 1);

    const before = storage.getUsage().usedCapacity;

    // Storing evicts whatever is freeable; what was reported as occupied has
    // to survive it.
    storage.onSegmentRequested(
      SWARM_ID,
      STREAM_SWARM_ID,
      3,
      30,
      40,
      "main",
      true,
    );
    await storage.storeSegment(
      SWARM_ID,
      STREAM_SWARM_ID,
      3,
      new ArrayBuffer(SEGMENT_BYTES),
      30,
      40,
      "main",
      true,
    );

    expect(storage.getStoredSegmentIds(SWARM_ID, STREAM_SWARM_ID)).toEqual([
      1, 2, 3,
    ]);
    expect(storage.getUsage().usedCapacity).toBe(before + SEGMENT_BYTES / MiB);
  });

  it("counts a re-stored segment once", async () => {
    const storage = await initStorage();

    // Before the first request there is no playhead to measure against, so
    // usage is the byte count the storage keeps.
    for (const _ of [0, 1]) {
      await storage.storeSegment(
        SWARM_ID,
        STREAM_SWARM_ID,
        0,
        new ArrayBuffer(SEGMENT_BYTES),
        0,
        10,
        "main",
        false,
      );
    }

    expect(storage.getUsage().usedCapacity).toBe(SEGMENT_BYTES / MiB);
  });
});
