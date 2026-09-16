import { describe, expect, it, vi } from "vitest";
import { VideoJsP2PEngine } from "../src/engine.js";
import type {
  VhsRequestHook,
  VhsResponseHook,
  VhsXhr,
  VideoJsLike,
  VideoJsPlayerLike,
} from "../src/types.js";

function fakeVideoJs() {
  const original = Object.assign(vi.fn(), {
    original: true,
  }) as unknown as VhsXhr;
  original.onRequest = (cb: VhsRequestHook) => {
    (original._requestCallbackSet ??= new Set()).add(cb);
  };
  original.offRequest = (cb: VhsRequestHook) =>
    original._requestCallbackSet?.delete(cb);
  original.onResponse = (cb: VhsResponseHook) => {
    (original._responseCallbackSet ??= new Set()).add(cb);
  };
  original.offResponse = (cb: VhsResponseHook) =>
    original._responseCallbackSet?.delete(cb);
  const plugins = new Map<string, unknown>();
  const videojs = {
    xhr: vi.fn(),
    Vhs: { xhr: original },
    registerPlugin: vi.fn((name: string, plugin: unknown) =>
      plugins.set(name, plugin),
    ),
    getPlugin: vi.fn((name: string) => plugins.get(name)),
    deregisterPlugin: vi.fn((name: string) => plugins.delete(name)),
  };
  return {
    videojs: videojs as unknown as VideoJsLike,
    spies: videojs,
    original,
    plugins,
  };
}

/** A player whose VHS handler carries the hook registry VHS gives one. */
function fakePlayer() {
  const xhr = vi.fn() as unknown as VhsXhr;
  xhr.onRequest = (cb: VhsRequestHook) => {
    (xhr._requestCallbackSet ??= new Set()).add(cb);
  };
  xhr.offRequest = (cb: VhsRequestHook) => xhr._requestCallbackSet?.delete(cb);
  xhr.onResponse = (cb: VhsResponseHook) => {
    (xhr._responseCallbackSet ??= new Set()).add(cb);
  };
  xhr.offResponse = (cb: VhsResponseHook) =>
    xhr._responseCallbackSet?.delete(cb);

  const player = {
    tech: vi.fn(() => ({ el: () => null, vhs: { xhr } })),
    // No source yet: nothing for the engine to read on binding.
    currentSrc: vi.fn(() => ""),
    on: vi.fn(),
    off: vi.fn(),
  };
  return { player: player as unknown as VideoJsPlayerLike, spies: player, xhr };
}

describe("VideoJsP2PEngine", () => {
  it("binds one engine to one player, and hooks the page only for first manifests", () => {
    const { videojs, spies, original } = fakeVideoJs();
    const { player, xhr } = fakePlayer();
    const engine = new VideoJsP2PEngine({ core: { swarmId: "s" } }, videojs);

    engine.bindPlayer(player);
    // The page's xhr function keeps its identity; only its hook set grows.
    expect(videojs.Vhs.xhr).toBe(original);
    expect(original._requestCallbackSet?.size).toBe(1);
    expect(original._responseCallbackSet?.size).toBe(1);
    expect(spies.registerPlugin).not.toHaveBeenCalled();
    // The player's own request and response hooks carry every other request.
    expect(xhr._requestCallbackSet?.size).toBe(1);
    expect(xhr._responseCallbackSet?.size).toBe(1);

    engine.destroy();
    expect(xhr._requestCallbackSet?.size ?? 0).toBe(0);
    expect(xhr._responseCallbackSet?.size ?? 0).toBe(0);
    expect(original._requestCallbackSet?.size ?? 0).toBe(0);
    expect(original._responseCallbackSet?.size ?? 0).toBe(0);
  });
});

describe("VideoJsP2PEngine plugins", () => {
  it("registers the plugin and removes it again, touching nothing else", () => {
    const { videojs, spies, original, plugins } = fakeVideoJs();
    VideoJsP2PEngine.registerPlugins(videojs);
    expect(plugins.has(VideoJsP2PEngine.PLUGIN_NAME)).toBe(true);
    // The page's own xhr function is left exactly as VHS made it.
    expect(videojs.Vhs.xhr).toBe(original);
    VideoJsP2PEngine.registerPlugins(videojs); // idempotent
    expect(spies.registerPlugin).toHaveBeenCalledTimes(1);

    VideoJsP2PEngine.unregisterPlugins(videojs);
    expect(plugins.has(VideoJsP2PEngine.PLUGIN_NAME)).toBe(false);
    expect(videojs.Vhs.xhr).toBe(original);
  });

  it("the plugin creates an engine bound to the player it is called on", () => {
    const { videojs, plugins } = fakeVideoJs();
    VideoJsP2PEngine.registerPlugins(videojs);
    const plugin = plugins.get(VideoJsP2PEngine.PLUGIN_NAME) as (
      this: VideoJsPlayerLike,
      config?: unknown,
    ) => VideoJsP2PEngine;
    const { player, spies } = fakePlayer();
    const engine = plugin.call(player, { core: { swarmId: "s" } });
    expect(engine).toBeInstanceOf(VideoJsP2PEngine);
    expect(engine.getConfig().core.mainStream.swarmId).toBe("s");
    expect(spies.on.mock.calls.map((c) => c[0])).toEqual([
      "loadstart",
      "dispose",
    ]);
    engine.destroy();
    expect(spies.off.mock.calls.map((c) => c[0])).toEqual([
      "loadstart",
      "dispose",
    ]);
    VideoJsP2PEngine.unregisterPlugins(videojs);
  });
});
