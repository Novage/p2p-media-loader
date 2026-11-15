import { describe, expect, it, vi } from "vitest";
import { ShakaP2PEngine } from "../src/engine.js";
import type { HookedRequest, Shaka } from "../src/types.js";

/**
 * Enough of a Shaka player for an engine to bind to and let go of, with the
 * request filters it registered, for a test to send a request through.
 */
function fakePlayer() {
  const configuration: Record<string, unknown> = {
    manifest: { defaultPresentationDelay: 0, dash: {} },
    streaming: {},
  };
  const filters: unknown[] = [];
  const player = {
    getConfiguration: () => configuration,
    configure: (path: string, value: unknown) => {
      const keys = path.split(".");
      const last = keys.pop()!;
      let node = configuration;
      for (const key of keys) {
        node[key] ??= {};
        node = node[key] as Record<string, unknown>;
      }
      node[last] = value;
    },
    getLoadMode: () => 2,
    getMediaElement: () => null,
    getNetworkingEngine: () => ({
      registerRequestFilter: (filter: unknown) => filters.push(filter),
      unregisterRequestFilter: (filter: unknown) => {
        const at = filters.indexOf(filter);
        if (at >= 0) filters.splice(at, 1);
      },
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as shaka.Player;
  return { player, filters: filters as shaka.extern.RequestFilter[] };
}

type Entry = { priority: number; plugin: unknown; progressSupport: boolean };

/**
 * Shaka's `NetworkingEngine` scheme registry as it behaves: one entry per
 * scheme, a registration replacing it only at equal or higher priority,
 * `progressSupport` stored with the registration and defaulting to false,
 * and removal deleting the entry outright.
 */
function fakeShaka(fetchSupported = true) {
  const PluginPriority = { FALLBACK: 1, PREFERRED: 2, APPLICATION: 3 };
  const schemes = new Map<string, Entry>();
  const NetworkingEngine = {
    PluginPriority,
    RequestType: { MANIFEST: 0, SEGMENT: 1 },
    registerScheme: (
      scheme: string,
      plugin: unknown,
      priority: number = PluginPriority.APPLICATION,
      progressSupport = false,
    ) => {
      const current = schemes.get(scheme);
      if (!current || priority >= current.priority) {
        schemes.set(scheme, { priority, plugin, progressSupport });
      }
    },
    unregisterScheme: (scheme: string) => schemes.delete(scheme),
  };
  const HttpFetchPlugin = { parse: vi.fn(), isSupported: () => fetchSupported };
  const HttpXHRPlugin = { parse: vi.fn() };
  const DataUriPlugin = { parse: vi.fn() };
  // As Shaka's module load leaves it.
  if (fetchSupported) {
    NetworkingEngine.registerScheme("http", HttpFetchPlugin.parse, 2, true);
    NetworkingEngine.registerScheme("https", HttpFetchPlugin.parse, 2, true);
  }
  NetworkingEngine.registerScheme("http", HttpXHRPlugin.parse, 1, true);
  NetworkingEngine.registerScheme("https", HttpXHRPlugin.parse, 1, true);
  NetworkingEngine.registerScheme("data", DataUriPlugin.parse);
  const shakaLib = {
    Player: { version: "5.2.9", LoadMode: { DESTROYED: 0 } },
    net: { NetworkingEngine, HttpFetchPlugin, HttpXHRPlugin, DataUriPlugin },
    util: {},
  } as unknown as Shaka;
  return { shakaLib, schemes, HttpFetchPlugin, HttpXHRPlugin, DataUriPlugin };
}

/**
 * What Shaka's networking engine passes a scheme plugin, in order: uri,
 * request, request type, progress callback, headers-received callback, config.
 */
function pluginArgs(uri: string) {
  return [uri, "req", 0, "progress", "headers", "config"] as const;
}

function call(plugin: unknown, uri: string) {
  (plugin as (...a: unknown[]) => unknown)(...pluginArgs(uri));
}

describe("Shaka scheme registration", () => {
  it("registers without progress support, so a served segment has no deadline", () => {
    // Progress support is a property of the registration: with it Shaka arms
    // its connection timer for every request on the scheme, and only the
    // plugin's progress callback stops it. A core-served segment reports no
    // progress — the callback would replace the bandwidth the response
    // carries — so the timer would become a ten-second deadline on the whole
    // delivery. Shaka's own plugins, which do report progress, are reached
    // with the callback and bounded by their own `timeout`.
    const { shakaLib, schemes } = fakeShaka();
    ShakaP2PEngine.registerPlugins(shakaLib);

    for (const scheme of ["http", "https"]) {
      expect(schemes.get(scheme)).toMatchObject({
        priority: 3,
        progressSupport: false,
      });
    }
    expect(schemes.get("data")).toMatchObject({ progressSupport: false });
  });

  it("gives Shaka its own plugins back when unregistering", () => {
    // `unregisterScheme` deletes the entry outright and Shaka registers its
    // defaults once, at module load. Left empty, every http, https and data
    // request from any other Shaka player on the page fails as an
    // unsupported scheme.
    const { shakaLib, schemes, HttpFetchPlugin, DataUriPlugin } = fakeShaka();
    ShakaP2PEngine.registerPlugins(shakaLib);
    const ours = schemes.get("data")?.plugin;
    ShakaP2PEngine.unregisterPlugins(shakaLib);

    for (const scheme of ["http", "https"]) {
      const entry = schemes.get(scheme);
      expect(entry).toMatchObject({ priority: 2, progressSupport: true });
      call(entry?.plugin, "uri");
      expect(HttpFetchPlugin.parse).toHaveBeenLastCalledWith(
        ...pluginArgs("uri"),
      );
    }
    // Shaka's plugin itself, not the adapter's passing a data URI through to
    // it: both call `DataUriPlugin.parse` with the same arguments, and both
    // sit at APPLICATION priority.
    const data = schemes.get("data");
    expect(data?.plugin).toBeDefined();
    expect(data?.plugin).not.toBe(ours);
    call(data?.plugin, "data:,x");
    expect(DataUriPlugin.parse).toHaveBeenLastCalledWith(
      ...pluginArgs("data:,x"),
    );
  });

  it("falls back to Shaka's XHR plugin where fetch is not supported", () => {
    const { shakaLib, schemes, HttpXHRPlugin } = fakeShaka(false);
    ShakaP2PEngine.registerPlugins(shakaLib);
    ShakaP2PEngine.unregisterPlugins(shakaLib);

    for (const scheme of ["http", "https"]) {
      const entry = schemes.get(scheme);
      expect(entry).toMatchObject({ priority: 1, progressSupport: true });
      call(entry?.plugin, "uri");
      expect(HttpXHRPlugin.parse).toHaveBeenLastCalledWith(
        ...pluginArgs("uri"),
      );
    }
  });

  it("hands the schemes back when the last registration is matched", () => {
    // Two players on a page, each registering on mount and unregistering on
    // unmount in its own time; the registry is one per library. Handing the
    // schemes back on the first unmount would leave the second player served
    // by Shaka's own plugins: still playing, with no P2P and no error.
    const { shakaLib, schemes, HttpFetchPlugin } = fakeShaka();
    ShakaP2PEngine.registerPlugins(shakaLib);
    ShakaP2PEngine.registerPlugins(shakaLib);
    // The second registration's handler, which replaced the first at equal
    // priority as Shaka's registry does.
    const ours = schemes.get("http")?.plugin;

    ShakaP2PEngine.unregisterPlugins(shakaLib);
    for (const scheme of ["http", "https", "data"]) {
      expect(schemes.get(scheme)?.plugin).toBe(ours);
    }
    expect(HttpFetchPlugin.parse).not.toHaveBeenCalled();

    ShakaP2PEngine.unregisterPlugins(shakaLib);
    expect(schemes.get("http")).toMatchObject({ priority: 2 });
    expect(schemes.get("http")?.plugin).not.toBe(ours);
    call(schemes.get("http")?.plugin, "uri");
    expect(HttpFetchPlugin.parse).toHaveBeenCalledTimes(1);
  });

  it("leaves a registry it never took over alone", () => {
    // An integrator's own APPLICATION-priority plugin, and an unmatched
    // `unregisterPlugins` — a cleanup run twice, or one with no registration
    // behind it. Not this adapter's registry to hand back to Shaka.
    const { shakaLib, schemes } = fakeShaka();
    const theirs = () => undefined;
    shakaLib.net.NetworkingEngine.registerScheme("https", theirs);
    ShakaP2PEngine.unregisterPlugins(shakaLib);
    expect(schemes.get("https")?.plugin).toBe(theirs);

    ShakaP2PEngine.registerPlugins(shakaLib);
    ShakaP2PEngine.unregisterPlugins(shakaLib);
    ShakaP2PEngine.unregisterPlugins(shakaLib);
    expect(schemes.get("https")).toMatchObject({ priority: 2 });
  });

  it("refuses to bind while no registration is in effect", () => {
    // Never registered, or matched off before the bind: the engine's stamps
    // would be read by no one and the player would play on without P2P.
    const { shakaLib } = fakeShaka();
    const engine = new ShakaP2PEngine(undefined, shakaLib);
    expect(() => engine.bindShakaPlayer(fakePlayer().player)).toThrow(
      /registerPlugins\(\) is not in effect/,
    );

    ShakaP2PEngine.registerPlugins(shakaLib);
    ShakaP2PEngine.unregisterPlugins(shakaLib);
    expect(() => engine.bindShakaPlayer(fakePlayer().player)).toThrow(
      /registerPlugins\(\) is not in effect/,
    );

    ShakaP2PEngine.registerPlugins(shakaLib);
    expect(() => engine.bindShakaPlayer(fakePlayer().player)).not.toThrow();
    engine.destroy();
  });

  it("lets an unmount unregister and destroy in either order", () => {
    // React runs cleanups in declaration order; the demo's lets the schemes
    // go a moment before it destroys the engine. Neither order fails.
    const { shakaLib } = fakeShaka();
    ShakaP2PEngine.registerPlugins(shakaLib);
    const engine = new ShakaP2PEngine(undefined, shakaLib);
    const { player, filters } = fakePlayer();
    engine.bindShakaPlayer(player);

    ShakaP2PEngine.unregisterPlugins(shakaLib);
    const request = {} as HookedRequest;
    expect(() =>
      filters[0](0 as shaka.net.NetworkingEngine.RequestType, request),
    ).not.toThrow();
    expect(() => engine.destroy()).not.toThrow();
  });

  it("leaves the registry and the count alone when a restore cannot run", () => {
    // A library without the plugins to put back: the fault is found before
    // the first scheme is removed, so nothing is half-restored, and the
    // adapter's registration still counts — a bind after it is not refused.
    const { shakaLib, schemes } = fakeShaka();
    const trimmed = {
      ...shakaLib,
      net: { NetworkingEngine: shakaLib.net.NetworkingEngine },
    } as unknown as Shaka;
    ShakaP2PEngine.registerPlugins(trimmed);
    const ours = schemes.get("http")?.plugin;

    expect(() => ShakaP2PEngine.unregisterPlugins(trimmed)).toThrow(TypeError);
    for (const scheme of ["http", "https", "data"]) {
      expect(schemes.get(scheme)?.plugin).toBe(ours);
    }
    const engine = new ShakaP2PEngine(undefined, trimmed);
    expect(() => engine.bindShakaPlayer(fakePlayer().player)).not.toThrow();
    engine.destroy();
  });

  it("does not count a registration that threw", () => {
    const { shakaLib } = fakeShaka();
    const broken = {
      ...shakaLib,
      net: { ...shakaLib.net, NetworkingEngine: { RequestType: {} } },
    } as unknown as Shaka;
    expect(() => ShakaP2PEngine.registerPlugins(broken)).toThrow(TypeError);

    const engine = new ShakaP2PEngine(undefined, broken);
    expect(() => engine.bindShakaPlayer(fakePlayer().player)).toThrow(
      /registerPlugins\(\) is not in effect/,
    );
  });
});
