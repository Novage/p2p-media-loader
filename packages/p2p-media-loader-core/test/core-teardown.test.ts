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

/** A storage whose initialization the test finishes when it chooses. */
function deferredStorage() {
  let finish!: () => void;
  let fail!: (error: Error) => void;
  const initialized = new Promise<void>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  initialized.catch(() => undefined);
  const storage = {
    initialize: () => initialized,
    setSegmentChangeCallback: vi.fn(),
    destroy: vi.fn(),
  };
  return { storage, finish, fail };
}

describe("Core.destroy", () => {
  it("reports a request it aborted as aborted, whatever the storage then says", async () => {
    // The storage torn down by the destroy rejects the initialization the
    // request was waiting on; the request was aborted, not failed.
    const { storage, fail } = deferredStorage();
    const core = new Core({
      manifestParsers: [hlsManifestParser],
      customSegmentStorageFactory: () => storage as unknown as never,
    });
    const loading = core.loadSegment("https://cdn.example/none/1.ts");
    core.destroy();
    fail(new Error("backend is gone"));

    await expect(loading).rejects.toMatchObject({ type: "aborted" });
  });

  it("does not install a storage whose initialization outlived the destroy", async () => {
    // The first source's request starts a storage; the source is torn down
    // while it initializes; the next source's request starts one of its own.
    // The first, finishing late, must recognise it is no longer the one
    // being waited for, rather than install itself over the second's.
    const storages = [deferredStorage(), deferredStorage()];
    let created = 0;
    const core = new Core({
      manifestParsers: [hlsManifestParser],
      customSegmentStorageFactory: () =>
        storages[created++].storage as unknown as never,
    });
    const state = core as unknown as { segmentStorage?: unknown };
    // A URL no manifest listed: the request ends at the registry, after the
    // storage is up, which is all this needs of it.
    const first = core.loadSegment("https://cdn.example/none/1.ts");
    first.catch(() => undefined);
    core.destroy();
    const second = core.loadSegment("https://cdn.example/none/2.ts");
    second.catch(() => undefined);
    expect(created).toBe(2);

    storages[0].finish();
    await expect(first).rejects.toMatchObject({ type: "aborted" });
    expect(storages[0].storage.destroy).toHaveBeenCalled();
    expect(state.segmentStorage).toBeUndefined();

    storages[1].finish();
    await expect(second).rejects.toThrow(/not in the registry/);
    expect(state.segmentStorage).toBe(storages[1].storage);
    expect(storages[1].storage.destroy).not.toHaveBeenCalled();
  });

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
