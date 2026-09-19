import { describe, expect, it, vi } from "vitest";
import type { ProcessedManifest } from "p2p-media-loader-core";
import { ShakaP2PEngine } from "../src/engine.js";
import type { HookedRequest, Shaka } from "../src/types.js";

/** A live window of `segmentCount` segments of `segmentSeconds` each. */
function manifest(segmentCount: number, segmentSeconds: number) {
  return {
    streams: [
      {
        key: "v",
        type: "main" as const,
        isLive: true,
        start: 0,
        end: segmentCount * segmentSeconds,
        segmentCount,
      },
    ],
  } satisfies ProcessedManifest;
}

/**
 * Enough of a Shaka player for the engine to bind to and configure. Its
 * configuration reflects what was configured, as the real one's does.
 */
function setup() {
  const configuration = {
    manifest: {
      defaultPresentationDelay: 0,
      dash: { ignoreSuggestedPresentationDelay: false },
    },
    // The fake Shaka below reports 4.7.0, which takes the older setting.
    streaming: { useNativeHlsOnSafari: true },
  };
  const filters: shaka.extern.RequestFilter[] = [];
  /** The player events the engine listens for, so a test can fire them. */
  const listeners = new Map<string, () => void>();
  let alive = true;
  let engineAlive = true;
  /** Shaka's own values, which the production code reads by name. */
  const LoadMode = {
    DESTROYED: 0,
    NOT_LOADED: 1,
    MEDIA_SOURCE: 2,
    SRC_EQUALS: 3,
  };
  /** Writes any dotted path, as the real `configure` does. */
  const configure = vi.fn((path: string, value: unknown) => {
    // Shaka asserts its config is not null; after `player.destroy()` it is.
    if (!alive) throw new TypeError("Config must not be null!");
    const keys = path.split(".");
    const last = keys.pop()!;
    let node = configuration as unknown as Record<string, unknown>;
    for (const key of keys) {
      node[key] ??= {};
      node = node[key] as Record<string, unknown>;
    }
    node[last] = value;
  });
  const player = {
    getConfiguration: () => configuration,
    configure,
    /** Always a number, as Shaka's is; DESTROYED once it has been torn down. */
    getLoadMode: () => (alive ? LoadMode.MEDIA_SOURCE : LoadMode.DESTROYED),
    /** As Shaka's does, this returns null once the player is destroyed. */
    getNetworkingEngine: () =>
      !engineAlive
        ? null
        : {
            registerRequestFilter: (filter: shaka.extern.RequestFilter) =>
              filters.push(filter),
            unregisterRequestFilter: (filter: shaka.extern.RequestFilter) => {
              const at = filters.indexOf(filter);
              if (at >= 0) filters.splice(at, 1);
            },
          },
    addEventListener: (type: string, listener: () => void) =>
      listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
  };

  const shakaLib = {
    Player: { version: "4.7.0", LoadMode },
    net: { NetworkingEngine: { RequestType: {} } },
    util: {},
  } as unknown as Shaka;

  const engine = new ShakaP2PEngine(undefined, shakaLib);
  engine.bindShakaPlayer(player as unknown as shaka.Player);

  // The request filter is where the engine hands its manifest callback over,
  // so a processed manifest is delivered through it as the loader would.
  const request = {} as HookedRequest;
  filters[0](0 as shaka.net.NetworkingEngine.RequestType, request);
  const deliver = (processed: ProcessedManifest) =>
    request.p2pml?.onManifestProcessed(processed);

  /**
   * The manifest callback of whichever binding is current — nothing at all
   * once the engine has unregistered its filter, as a released player sees.
   */
  const deliverNow = (processed: ProcessedManifest) => {
    const filter = filters[filters.length - 1];
    if (!filter) return;
    const current = {} as HookedRequest;
    filter(0 as shaka.net.NetworkingEngine.RequestType, current);
    current.p2pml?.onManifestProcessed(processed);
  };

  /**
   * Shaka's teardown order: `loadMode_` is DESTROYED and the configuration is
   * gone before the networking engine is, which outlives both by as long as
   * the requests in flight take to settle.
   */
  const destroyPlayer = ({ networkingEngineGone = true } = {}) => {
    alive = false;
    engineAlive = !networkingEngineGone ? true : false;
  };

  /** Shaka announcing the next source, as it does on every `load()`. */
  const loadAnotherSource = () => listeners.get("loading")?.();
  /** The player letting its source go, with nothing loaded after it. */
  const unloadSource = () => listeners.get("unloading")?.();

  /** What a request made now would hold on to, to know its presentation. */
  const presentation = () => {
    const filter = filters[filters.length - 1];
    if (!filter) return undefined;
    const current = {} as HookedRequest;
    filter(0 as shaka.net.NetworkingEngine.RequestType, current);
    return current.p2pml?.currentSource();
  };

  return {
    configuration,
    configure,
    deliver,
    deliverNow,
    engine,
    player,
    destroyPlayer,
    loadAnotherSource,
    unloadSource,
    presentation,
    shakaLib,
    filters,
  };
}

describe("shaka live window placement", () => {
  it("gives the player back the placement it came with", () => {
    // An integrator turning P2P off at runtime keeps the player. Left as the
    // engine wrote them, the next live load starts up to a minute behind the
    // edge with the MPD's own suggestion ignored, and no engine attached.
    const { configuration, engine, deliver } = setup();
    deliver(manifest(7, 8));
    expect(configuration.manifest.defaultPresentationDelay).toBe(48);
    expect(configuration.manifest.dash.ignoreSuggestedPresentationDelay).toBe(
      true,
    );

    engine.destroy();

    expect(configuration.manifest.defaultPresentationDelay).toBe(0);
    expect(configuration.manifest.dash.ignoreSuggestedPresentationDelay).toBe(
      false,
    );
  });

  it("does not let an audio rendition's window size the placement", () => {
    // An HLS presentation arrives a manifest at a time: the master, then each
    // media playlist on its own. A rendition's describes a presentation with
    // no main stream in it, and its window is the audio window.
    const { configuration, deliver } = setup();
    deliver(manifest(7, 8));
    expect(configuration.manifest.defaultPresentationDelay).toBe(48);

    deliver({
      streams: [
        {
          key: "https://cdn.example/live/audio/en/index.m3u8",
          type: "secondary",
          isLive: true,
          start: 0,
          end: 120,
          segmentCount: 60,
        },
      ],
    });

    expect(configuration.manifest.defaultPresentationDelay).toBe(48);
  });

  it("sizes an audio-only presentation from the audio it has", () => {
    // The fallback to the widest stream is for a presentation with no main
    // stream at all, and must keep working for one.
    const { configuration, deliver } = setup();
    deliver({
      streams: [
        {
          key: "https://cdn.example/live/audio/en/index.m3u8",
          type: "secondary",
          isLive: true,
          start: 0,
          end: 56,
          segmentCount: 7,
        },
      ],
    });

    expect(configuration.manifest.defaultPresentationDelay).toBe(48);
  });

  it("gives back native HLS along with the delay", () => {
    // Written for every player, including one whose delay is the
    // integrator's own. Left off, the player plays through MSE for good — and
    // where MSE is not usable, the next HLS load fails outright instead of
    // falling back to native playback.
    const { configuration, engine } = setup();
    expect(configuration.streaming.useNativeHlsOnSafari).toBe(false);

    engine.destroy();

    expect(configuration.streaming.useNativeHlsOnSafari).toBe(true);
  });

  it("lets go of the player even when tearing the core down throws", () => {
    // The core's own teardown destroys the segment storage, which an
    // integrator supplies through `customSegmentStorageFactory` and is free
    // to throw from. Holding on to the player then would leave this engine
    // writing a presentation delay onto one it was told to release, from the
    // responses still in flight.
    const { engine, configuration, deliverNow } = setup();
    const core = (engine as unknown as { core: { destroy: () => void } }).core;
    core.destroy = () => {
      throw new Error("storage teardown failed");
    };

    expect(() => engine.destroy()).toThrow("storage teardown failed");

    // Released all the same: nothing more of this engine's reaches the player.
    configuration.manifest.defaultPresentationDelay = 7;
    deliverNow(manifest(7, 8));
    expect(configuration.manifest.defaultPresentationDelay).toBe(7);
  });

  it("starts each source from the pre-manifest delay", () => {
    // A source whose first manifest carries no measurable window writes
    // nothing — a live `SegmentBase` MPD registers its streams with no
    // segments — so what the player holds is what places it. Left at the last
    // source's delay that can be well outside this source's window.
    const { configuration, deliver, loadAnotherSource } = setup();
    deliver(manifest(7, 8));
    expect(configuration.manifest.defaultPresentationDelay).toBe(48);

    loadAnotherSource();

    expect(configuration.manifest.defaultPresentationDelay).toBe(25);
  });

  it("starts a source over even when tearing the core down throws", () => {
    // Shaka swallows what a listener throws, so a teardown that failed would
    // silently leave the next source carrying the last one's placement.
    const { configuration, engine, deliver, loadAnotherSource } = setup();
    deliver(manifest(7, 8));
    const core = (engine as unknown as { core: { destroy: () => void } }).core;
    core.destroy = () => {
      throw new Error("storage teardown failed");
    };

    expect(() => loadAnotherSource()).toThrow("storage teardown failed");

    expect(configuration.manifest.defaultPresentationDelay).toBe(25);
    // And live radio after it is sized from its own window, not refused.
    deliver({
      streams: [
        {
          key: "https://cdn.example/radio/index.m3u8",
          type: "secondary",
          isLive: true,
          start: 0,
          end: 30,
          segmentCount: 5,
        },
      ],
    });
    expect(configuration.manifest.defaultPresentationDelay).toBe(24);
  });

  it("ends the source identity when the player unloads it", () => {
    // Unloading with nothing loaded after is the one way a source ends that
    // `loading` never sees. A response still in flight would otherwise be
    // read straight back into the core that was just emptied for it.
    const { presentation, unloadSource } = setup();
    const playing = presentation();
    expect(playing).toBeDefined();

    unloadSource();

    expect(presentation()).toBeDefined();
    expect(presentation()).not.toBe(playing);
  });

  it("gives each source an identity of its own", () => {
    // What a request holds on to so a response can be told to belong to the
    // presentation before it — a source switch on one player, not only a
    // switch of player.
    const { presentation, loadAnotherSource, engine } = setup();
    const first = presentation();
    expect(first).toBeDefined();

    loadAnotherSource();
    expect(presentation()).toBeDefined();
    expect(presentation()).not.toBe(first);

    // And nothing at all once the player is let go.
    engine.destroy();
    expect(presentation()).toBeUndefined();
  });

  it("sizes each source on its own, not on the one before it", () => {
    // One player, two `load()` calls. A video stream teaches the engine that
    // this presentation has a main stream; live radio after it has none, and
    // would otherwise be refused a placement and left at the video's delay —
    // outside its window entirely.
    const { configuration, deliver, loadAnotherSource } = setup();
    deliver(manifest(7, 8));
    expect(configuration.manifest.defaultPresentationDelay).toBe(48);

    loadAnotherSource();
    deliver({
      streams: [
        {
          key: "https://cdn.example/radio/index.m3u8",
          type: "secondary",
          isLive: true,
          start: 0,
          end: 30,
          segmentCount: 5,
        },
      ],
    });

    expect(configuration.manifest.defaultPresentationDelay).toBe(24);
  });

  it("takes its filter off a player even when the teardown throws", () => {
    // Left on, it keeps stamping every request: the next manifest refills the
    // registry and segments are served from peers again, for an engine the
    // integrator switched off and a player it reports as released.
    const { engine, filters } = setup();
    const core = (engine as unknown as { core: { destroy: () => void } }).core;
    core.destroy = () => {
      throw new Error("storage teardown failed");
    };
    expect(filters).toHaveLength(1);

    expect(() => engine.destroy()).toThrow("storage teardown failed");

    expect(filters).toHaveLength(0);
  });

  it("does not let a response of the last player size the next one", () => {
    // A manifest still in flight when the engine moves on describes the
    // source the player before was showing. Sizing the new player with it
    // also latches its bookkeeping with the old window, so the new source's
    // own first manifest is then suppressed or refused.
    const first = setup();
    const stale = first.deliver; // captured while player A was bound

    const second = setup();
    second.engine.destroy();
    second.configuration.manifest.defaultPresentationDelay = 0;
    second.filters.length = 0;
    first.engine.bindShakaPlayer(second.player as unknown as shaka.Player);
    expect(second.configuration.manifest.defaultPresentationDelay).toBe(25);

    // Player A's manifest settles now.
    expect(first.configuration.manifest.defaultPresentationDelay).toBe(0);
    stale(manifest(7, 8));
    expect(second.configuration.manifest.defaultPresentationDelay).toBe(25);
    expect(first.configuration.manifest.defaultPresentationDelay).toBe(0);

    // And player B is still sized by its own.
    second.deliverNow(manifest(4, 6));
    expect(second.configuration.manifest.defaultPresentationDelay).toBe(18);
  });

  it("holds what it took even when taking the rest fails", () => {
    // A write that failed part way through would otherwise strand what came
    // before it on the player, with nothing recorded to give back — and a
    // later binding reading that as the integrator's own choice.
    const { configuration, configure, engine, player } = setup();
    engine.destroy();
    expect(configuration.manifest.defaultPresentationDelay).toBe(0);

    // One path throws; the others write as they would. The delay is taken
    // before it, so it is the one that would be stranded.
    const write = configure.getMockImplementation()!;
    configure.mockImplementation((path: string, value: unknown) => {
      if (path === "manifest.dash.ignoreSuggestedPresentationDelay") {
        throw new Error("apply failed");
      }
      return write(path, value);
    });
    expect(() =>
      engine.bindShakaPlayer(player as unknown as shaka.Player),
    ).toThrow("apply failed");
    expect(configuration.manifest.defaultPresentationDelay).toBe(25);

    configure.mockImplementation(write);
    engine.destroy();
    expect(configuration.manifest.defaultPresentationDelay).toBe(0);
  });

  it("binds the next player even when letting go of the last one throws", () => {
    // The rebind path integrators use. An integrator's segment storage
    // failing to tear down is no reason for the player they are switching to
    // to stream without P2P or live placement for the rest of the session.
    const { engine } = setup();
    const core = (engine as unknown as { core: { destroy: () => void } }).core;
    core.destroy = () => {
      throw new Error("storage teardown failed");
    };

    const second = setup();
    second.engine.destroy();
    second.configuration.manifest.defaultPresentationDelay = 0;
    second.filters.length = 0;

    expect(() =>
      engine.bindShakaPlayer(second.player as unknown as shaka.Player),
    ).toThrow("storage teardown failed");

    // Bound all the same: its filter is on and it starts at the pre-manifest
    // delay, and a manifest sizes it.
    expect(second.filters).toHaveLength(1);
    expect(second.configuration.manifest.defaultPresentationDelay).toBe(25);
    second.deliverNow(manifest(7, 8));
    expect(second.configuration.manifest.defaultPresentationDelay).toBe(48);
  });

  it("gives back every setting even when one of them fails", () => {
    // `configure` merges and applies against the live player; one path
    // failing must not leave the rest written, or the player keeps this
    // engine's delay with nothing managing it.
    const { configuration, configure, engine } = setup();
    const nativeHls = "streaming.useNativeHlsOnSafari";
    configure.mockImplementationOnce((path: string) => {
      if (path === nativeHls) throw new Error("apply failed");
    });

    expect(() => engine.destroy()).toThrow("apply failed");

    // The one that threw is the integrator's to notice; the rest are back.
    expect(configuration.manifest.defaultPresentationDelay).toBe(0);
    expect(configuration.manifest.dash.ignoreSuggestedPresentationDelay).toBe(
      false,
    );
  });

  it("carries nothing held onto the next player when the teardown throws", () => {
    // What was held is player A's. Written onto player B it would silently
    // replace the delay B's integrator chose with A's.
    const { engine } = setup();
    const core = (engine as unknown as { core: { destroy: () => void } }).core;
    core.destroy = () => {
      throw new Error("storage teardown failed");
    };
    expect(() => engine.destroy()).toThrow("storage teardown failed");

    // Player B, left to itself, whose integrator set a delay of their own.
    const second = setup();
    second.engine.destroy();
    second.configuration.manifest.defaultPresentationDelay = 12;

    core.destroy = () => undefined;
    engine.bindShakaPlayer(second.player as unknown as shaka.Player);
    engine.destroy();

    expect(second.configuration.manifest.defaultPresentationDelay).toBe(12);
  });

  it("lets go of a player that was destroyed first", () => {
    // `await player.destroy(); engine.destroy();` is an ordinary teardown.
    // Shaka's `configure` asserts a config the destroyed player no longer
    // has, and a throw here would leave the engine holding a dead player.
    const { engine, destroyPlayer } = setup();
    destroyPlayer();

    expect(() => engine.destroy()).not.toThrow();
  });

  it("lets go of a player still tearing its networking engine down", () => {
    // Shaka drops the configuration first and nulls the networking engine
    // only after every request in flight has settled — hundreds of
    // milliseconds later. A player is gone from the moment its load mode says
    // so, not from the moment its networking engine does.
    const { engine, destroyPlayer } = setup();
    destroyPlayer({ networkingEngineGone: false });

    expect(() => engine.destroy()).not.toThrow();
  });

  it("lets a second engine take the player over rather than run beside it", () => {
    // Both would place the same player and stamp its requests for cores of
    // their own, and the first destroyed would give back settings the second
    // still relies on — the live placement, or native HLS, which plays where
    // nothing can be served.
    const { configuration, player, filters, shakaLib, engine } = setup();
    expect(configuration.manifest.defaultPresentationDelay).toBe(25);

    const second = new ShakaP2PEngine(undefined, shakaLib);
    second.bindShakaPlayer(player as unknown as shaka.Player);

    // The first was released as part of that, so the second read the delay
    // the player came with and manages it — one filter, not two.
    expect(configuration.manifest.defaultPresentationDelay).toBe(25);
    expect(filters).toHaveLength(1);

    // And the first letting go now touches nothing of the second's.
    engine.destroy();
    expect(configuration.manifest.defaultPresentationDelay).toBe(25);
    expect(configuration.streaming.useNativeHlsOnSafari).toBe(false);
    expect(filters).toHaveLength(1);
  });

  it("still manages the delay when bound to the same player again", () => {
    // The engine reads the player's delay to tell the integrator's choice
    // from Shaka's default. Its own writes must not read back as a choice, or
    // a second binding leaves the placement dead for the session.
    const { engine, player, configuration, deliverNow } = setup();
    engine.destroy();

    engine.bindShakaPlayer(player as unknown as shaka.Player);
    deliverNow(manifest(7, 8));

    expect(configuration.manifest.defaultPresentationDelay).toBe(48);
  });

  it("places the playhead one segment inside the tail", () => {
    const { configuration, deliver } = setup();
    // A 56 s window of 8 s segments.
    deliver(manifest(7, 8));
    expect(configuration.manifest.defaultPresentationDelay).toBe(48);
  });

  it("places a window whose delay lands on the pre-manifest one", () => {
    const { configuration, deliver } = setup();
    // A 30 s window of 6 s segments asks for 24 s, within half a segment of
    // the delay bindShakaPlayer set before any manifest arrived.
    deliver(manifest(5, 6));
    expect(configuration.manifest.defaultPresentationDelay).toBe(24);
  });

  it("re-applies only when the window itself changes", () => {
    const { configure, deliver } = setup();
    deliver(manifest(7, 8));
    const afterFirst = configure.mock.calls.length;
    deliver(manifest(7, 8));
    expect(configure.mock.calls.length).toBe(afterFirst);

    deliver(manifest(12, 8));
    expect(configure.mock.calls.length).toBe(afterFirst + 1);
  });
});
