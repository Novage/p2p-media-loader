import { describe, expect, it, vi } from "vitest";
import { VideoJsP2PEngine } from "../src/engine.js";
import type { VhsXhr, VideoJsLike, VideoJsPlayerLike } from "../src/types.js";
import { hookRegistry } from "./helpers.js";

function fakeVideoJs() {
  const original = hookRegistry(
    Object.assign(vi.fn(), { original: true }) as unknown as VhsXhr,
  );
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
  const xhr = hookRegistry(vi.fn() as unknown as VhsXhr);

  const player = {
    tech: vi.fn(() => ({ el: () => null, vhs: { xhr } })),
    // No source yet: nothing for the engine to read on binding.
    currentSrc: vi.fn(() => ""),
    on: vi.fn(),
    off: vi.fn(),
  };
  return { player: player as unknown as VideoJsPlayerLike, spies: player, xhr };
}

/**
 * A player that has no VHS handler yet, as one has between `player.src(...)`
 * caching a source and the tech taking it on, and that dispatches the events
 * VHS and Video.js fire on it.
 */
function fakeLoadingPlayer() {
  const xhr = hookRegistry(vi.fn() as unknown as VhsXhr);

  let vhs: { xhr: VhsXhr } | undefined;
  const listeners = new Map<string, Set<() => void>>();
  const player = {
    tech: () => ({ el: () => null, vhs }),
    currentSrc: () => "https://cdn.example/hls/master.m3u8",
    on: (type: string, listener: () => void) => {
      (listeners.get(type) ?? listeners.set(type, new Set()).get(type))!.add(
        listener,
      );
    },
    off: (type: string, listener: () => void) =>
      listeners.get(type)?.delete(listener),
  };
  return {
    player: player as unknown as VideoJsPlayerLike,
    xhr,
    /** VHS taking the source on: the handler, its xhr, then the event. */
    handleSource: () => {
      vhs = { xhr };
      for (const listener of listeners.get("xhr-hooks-ready") ?? []) listener();
    },
  };
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

  it("hooks the player when VHS says its hooks are ready, before it asks", () => {
    // VHS creates the handler, its xhr function and its hooks, fires
    // `xhr-hooks-ready`, and only then requests the source's manifest — so
    // hooks put on there cover every request of the source, its first
    // included, and nothing has to be fetched a second time to be read.
    const { videojs, spies } = fakeVideoJs();
    const { player, xhr, handleSource } = fakeLoadingPlayer();
    const engine = new VideoJsP2PEngine({ core: { swarmId: "s" } }, videojs);

    engine.bindPlayer(player);
    // No handler to hook, and no manifest fetched behind VHS's back either.
    expect(xhr._requestCallbackSet?.size ?? 0).toBe(0);
    expect(spies.xhr).not.toHaveBeenCalled();

    handleSource();
    expect(xhr._requestCallbackSet?.size).toBe(1);
    expect(xhr._responseCallbackSet?.size).toBe(1);
    expect(spies.xhr).not.toHaveBeenCalled();

    engine.destroy();
    expect(xhr._requestCallbackSet?.size ?? 0).toBe(0);
  });

  it("lets a second engine take a player over rather than run beside it", () => {
    // Changing what an engine cannot change at runtime — a swarm ID, the
    // trackers — means a new engine. Both bound at once would read every
    // manifest into a core of their own, so one media element would drive two
    // peers in one swarm.
    const { videojs } = fakeVideoJs();
    const { player, xhr } = fakePlayer();
    const first = new VideoJsP2PEngine({ core: { swarmId: "a" } }, videojs);
    const second = new VideoJsP2PEngine({ core: { swarmId: "b" } }, videojs);

    first.bindPlayer(player);
    second.bindPlayer(player);

    // One set of hooks on the player, and one on the page.
    expect(xhr._requestCallbackSet?.size).toBe(1);
    expect(xhr._responseCallbackSet?.size).toBe(1);
    expect(videojs.Vhs.xhr._requestCallbackSet?.size).toBe(1);

    second.destroy();
    expect(xhr._requestCallbackSet?.size ?? 0).toBe(0);
  });
});

describe("VideoJsP2PEngine plugins", () => {
  it("does not take the record for a plugin it did not register", () => {
    // A second copy of this package on the page, or an integrator's own
    // plugin under this name: `registerPlugins` finds one already there and
    // registers nothing, so `unregisterPlugins` has nothing to take away.
    const { videojs, spies, plugins } = fakeVideoJs();
    const theirs = () => undefined;
    plugins.set(VideoJsP2PEngine.PLUGIN_NAME, theirs);

    VideoJsP2PEngine.registerPlugins(videojs);
    expect(spies.registerPlugin).not.toHaveBeenCalled();

    VideoJsP2PEngine.unregisterPlugins();
    expect(spies.deregisterPlugin).not.toHaveBeenCalled();
    expect(plugins.get(VideoJsP2PEngine.PLUGIN_NAME)).toBe(theirs);
  });

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
      "xhr-hooks-ready",
      "loadstart",
      "dispose",
    ]);
    engine.destroy();
    expect(spies.off.mock.calls.map((c) => c[0])).toEqual([
      "xhr-hooks-ready",
      "loadstart",
      "dispose",
    ]);
    VideoJsP2PEngine.unregisterPlugins(videojs);
  });
});
