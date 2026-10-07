import { describe, expect, it } from "vitest";
import { Core } from "../src/core.js";
import { hlsManifestParser } from "../src/manifest/hls.js";
import type { SegmentStorage } from "../src/segment-storage/index.js";
import {
  initializeSegmentStorage,
  recordingStorage,
} from "./recording-storage.js";
import {
  HLS_LIVE_NO_PDT_REFRESH_1,
  HLS_LIVE_NO_PDT_REFRESH_2,
} from "./fixtures/index.js";

const MEDIA_URL = "https://cdn.example/live/index.m3u8";

/**
 * A core on one live media playlist, with a storage that records what it is
 * told has left.
 */
async function liveCore(
  onSegmentsRemoved?: SegmentStorage["onSegmentsRemoved"],
) {
  const { storage, removed } = recordingStorage(onSegmentsRemoved);
  const core = new Core({
    manifestParsers: [hlsManifestParser],
    customSegmentStorageFactory: () => storage,
  });
  core.processManifest({ url: MEDIA_URL, data: HLS_LIVE_NO_PDT_REFRESH_1 });
  await initializeSegmentStorage(core);
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
