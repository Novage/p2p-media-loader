import { describe, expect, it } from "vitest";
import { Core } from "../src/core.js";
import { hlsManifestParser } from "../src/manifest/hls.js";
import type { SegmentStorage } from "../src/segment-storage/index.js";
import {
  HLS_LIVE_NO_PDT_REFRESH_1,
  HLS_LIVE_NO_PDT_REFRESH_2,
} from "./fixtures/index.js";

const MEDIA_URL = "https://cdn.example/live/index.m3u8";

/**
 * A core on one live media playlist, with a storage that records what it is
 * told has left. The core makes its storage on the first segment request;
 * these tests make it directly, which is all that request would do here.
 */
async function liveCore(
  onSegmentsRemoved?: SegmentStorage["onSegmentsRemoved"],
) {
  const removed: number[][] = [];
  const storage = {
    initialize: () => Promise.resolve(),
    onPlaybackUpdated: () => undefined,
    onSegmentRequested: () => undefined,
    storeSegment: () => Promise.resolve(),
    getSegmentData: () => Promise.resolve(undefined),
    getUsage: () => ({ totalCapacity: 1, usedCapacity: 0 }),
    hasSegment: () => false,
    getStoredSegmentIds: () => [],
    setSegmentChangeCallback: () => undefined,
    destroy: () => undefined,
    onSegmentsRemoved:
      onSegmentsRemoved ??
      ((_swarmId: string, _streamSwarmId: string, ids: readonly number[]) => {
        removed.push([...ids]);
      }),
  } satisfies SegmentStorage;
  const core = new Core({
    manifestParsers: [hlsManifestParser],
    customSegmentStorageFactory: () => storage,
  });
  core.processManifest({ url: MEDIA_URL, data: HLS_LIVE_NO_PDT_REFRESH_1 });
  await (
    core as unknown as { initializeSegmentStorage(): Promise<void> }
  ).initializeSegmentStorage();
  return { core, removed };
}

describe("Core telling the storage what a live window moved past", () => {
  it("names the segments the refreshed manifest no longer lists", async () => {
    // Media sequence 100..104, then 102..106: 100 and 101 have left.
    const { core, removed } = await liveCore();

    core.processManifest({ url: MEDIA_URL, data: HLS_LIVE_NO_PDT_REFRESH_2 });

    expect(removed).toEqual([[100, 101]]);
    core.destroy();
  });

  it("names nothing when a refresh lists the same segments under new URLs", async () => {
    // A CDN that signs every refresh's URLs anew changes each segment's key
    // and none of its identities; nothing has left the window.
    const { core, removed } = await liveCore();
    const resigned = HLS_LIVE_NO_PDT_REFRESH_1.replace(
      /seg(\d+)\.ts/g,
      "v2/seg$1.ts",
    );

    core.processManifest({ url: MEDIA_URL, data: resigned });

    expect(removed).toEqual([]);
    core.destroy();
  });

  it("goes on processing manifests when the storage throws", async () => {
    const { core } = await liveCore(() => {
      throw new Error("integrator's storage");
    });

    expect(() =>
      core.processManifest({ url: MEDIA_URL, data: HLS_LIVE_NO_PDT_REFRESH_2 }),
    ).not.toThrow();
    expect(core.isSegmentLoadable(`https://cdn.example/live/seg106.ts`)).toBe(
      true,
    );
    core.destroy();
  });
});
