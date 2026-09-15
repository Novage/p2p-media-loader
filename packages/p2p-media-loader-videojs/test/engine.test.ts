import { describe, expect, it, vi } from "vitest";
import { VideoJsP2PEngine } from "../src/engine.js";
import type { VhsXhr, VideoJsLike, VideoJsPlayerLike } from "../src/types.js";

function fakeVideoJs() {
  const original = Object.assign(vi.fn(), {
    original: true,
  }) as unknown as VhsXhr;
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

function fakePlayer() {
  const player = {
    tech: vi.fn(() => ({ el: () => null, vhs: undefined })),
    currentSrc: vi.fn(() => ""),
    on: vi.fn(),
    off: vi.fn(),
  };
  return { player: player as unknown as VideoJsPlayerLike, spies: player };
}

describe("VideoJsP2PEngine plugins", () => {
  it("replaces videojs.Vhs.xhr once, registers the plugin, and restores both on unregister", () => {
    const { videojs, spies, original, plugins } = fakeVideoJs();
    VideoJsP2PEngine.registerPlugins(videojs);
    expect(videojs.Vhs.xhr).not.toBe(original);
    expect(videojs.Vhs.xhr.original).not.toBe(true);
    expect(plugins.has(VideoJsP2PEngine.PLUGIN_NAME)).toBe(true);
    const replaced = videojs.Vhs.xhr;
    VideoJsP2PEngine.registerPlugins(videojs); // idempotent
    expect(videojs.Vhs.xhr).toBe(replaced);
    expect(spies.registerPlugin).toHaveBeenCalledTimes(1);

    VideoJsP2PEngine.unregisterPlugins(videojs);
    expect(videojs.Vhs.xhr).toBe(original);
    expect(plugins.has(VideoJsP2PEngine.PLUGIN_NAME)).toBe(false);
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
