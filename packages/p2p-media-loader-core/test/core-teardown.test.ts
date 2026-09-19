import { describe, expect, it, vi } from "vitest";
import { Core } from "../src/index.js";
import { hlsManifestParser } from "../src/manifest/hls.js";
import { MUX_720P_URL, readFixture } from "./fixtures/index.js";

/** Reaches the segment storage the core tears down with everything else. */
function coreWithFailingStorage() {
  const destroy = vi.fn(() => {
    throw new Error("storage teardown failed");
  });
  const core = new Core({ manifestParsers: [hlsManifestParser] });
  (core as unknown as { segmentStorage?: unknown }).segmentStorage = {
    destroy,
    setSegmentChangeCallback: () => undefined,
  };
  return { core, destroy };
}

describe("Core.destroy", () => {
  it("leaves nothing behind when a part of the teardown throws", () => {
    // An integrator supplies the segment storage through
    // `customSegmentStorageFactory` and is free to throw from its teardown.
    // Stopping there would leave destroyed loaders still referenced and the
    // failed storage still set, and the next stream on this core would take
    // both back and run with P2P silently dead.
    const { core, destroy } = coreWithFailingStorage();
    core.processManifest({
      url: MUX_720P_URL,
      data: readFixture("mux-720p-media.m3u8"),
    });
    expect(core.getStreams().length).toBeGreaterThan(0);

    expect(() => core.destroy()).toThrow("storage teardown failed");

    expect(destroy).toHaveBeenCalled();
    const state = core as unknown as {
      segmentStorage?: unknown;
      mainStreamLoader?: unknown;
      manifestResponseUrl?: string;
      storageInitPromise?: unknown;
    };
    expect(state.segmentStorage).toBeUndefined();
    expect(state.mainStreamLoader).toBeUndefined();
    expect(state.manifestResponseUrl).toBeUndefined();
    expect(state.storageInitPromise).toBeUndefined();
    expect(core.getStreams()).toHaveLength(0);
  });
});
