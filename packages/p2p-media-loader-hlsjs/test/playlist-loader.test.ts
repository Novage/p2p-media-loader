import { describe, expect, it, vi } from "vitest";
import type { HlsConfig, LoaderCallbacks, LoaderContext } from "hls.js";
import { HlsJsP2PEngine } from "../src/engine.js";

const MASTER = "https://cdn.example/hls/master.m3u8";

/** HLS.js's own loader, as `BaseLoader` behaves: no context until `load`. */
class FakeLoader {
  stats = { loading: { start: 0 } };
  context: LoaderContext | null = null;
  aborted = false;
  load(
    context: LoaderContext,
    _config: unknown,
    callbacks: LoaderCallbacks<LoaderContext>,
  ) {
    // HLS.js's own loader throws on a second use, and HLS.js builds a fresh
    // one for every request; a fake that allowed reuse would let a wrapper
    // holding per-request state across loads read as correct.
    if (this.stats.loading.start)
      throw new Error("Loader can only be used once.");
    this.stats.loading.start = 1;
    this.context = context;
    FakeLoader.last = this;
    FakeLoader.respond = (data: string) =>
      callbacks.onSuccess(
        { url: context.url, data } as never,
        this.stats as never,
        context,
        null,
      );
  }
  abort() {
    this.aborted = true;
  }
  destroy() {}
  age: number | null = null;
  getCacheAge() {
    return this.age;
  }
  static last: FakeLoader | undefined;
  static respond: (data: string) => void = () => undefined;
}

function playlistLoader(config: Record<string, unknown> = {}) {
  const engine = new HlsJsP2PEngine();
  const core = (engine as unknown as { core: { processManifest: unknown } })
    .core;
  const processManifest = vi.fn();
  core.processManifest = processManifest;
  const { pLoader } = engine.getConfigForHlsJs() as {
    pLoader: new (config: HlsConfig) => {
      context: LoaderContext | null;
      getCacheAge(): number | null;
      load(
        c: LoaderContext,
        cfg: unknown,
        cb: LoaderCallbacks<LoaderContext>,
      ): void;
    };
  };
  /** HLS.js constructs one of these per request; so does every test here. */
  const make = () =>
    new pLoader({ loader: FakeLoader, ...config } as unknown as HlsConfig);
  const load = (type: string, url = MASTER) => {
    const loader = make();
    loader.load({ url, type } as unknown as LoaderContext, {}, {
      onSuccess: vi.fn(),
    } as unknown as LoaderCallbacks<LoaderContext>);
    return loader;
  };
  return { make, load, processManifest };
}

describe("HLS.js playlist loader", () => {
  it("shows HLS.js the context of the request it is running", () => {
    // HLS.js reads the context back to tell a request already in flight from
    // a new one, and to abort the loader of a level it has dropped. A context
    // copied when the loader was built is null for the life of the object, so
    // a live refresh overlapping the one before it restarts that request
    // instead of being left alone.
    const { make, load } = playlistLoader();
    expect(make().context).toBeNull();

    const loader = load("level", "https://cdn.example/hls/720p.m3u8");
    expect(loader.context).toMatchObject({
      url: "https://cdn.example/hls/720p.m3u8",
      type: "level",
    });
  });

  it("answers HLS.js about the request the inner loader made", () => {
    // HLS.js reads this off the loader it was handed: it is how a live
    // playlist learns how long a CDN held it. Unanswered, HLS.js pins
    // `ageHeader` to 0 and a blocking reload asks for what the CDN has.
    const { load } = playlistLoader();
    const loader = load("level", "https://cdn.example/hls/720p.m3u8");
    FakeLoader.last!.age = 8;

    expect(loader.getCacheAge()).toBe(8);
  });

  it.each([
    // What HLS.js puts on an interstitial's ad player...
    ["an interstitial", { primarySessionId: "s1", assetPlayerId: "ad-1" }],
    // ...and on a trick-play I-frame player, which carries no asset id.
    ["a trick-play I-frame", { primarySessionId: "s1", loggerId: "iframe" }],
  ])("gives the core nothing from %s player", (_name, config) => {
    // Each is a second instance built from the primary's config, so it
    // carries these loaders and this core, and its own MANIFEST_LOADING
    // reaches no engine: what it loads would stay in the primary's registry
    // and be announced in the primary's swarm.
    const { load, processManifest } = playlistLoader(config);

    for (const type of ["manifest", "level", "audioTrack"]) {
      load(type, "https://elsewhere.example/other/playlist.m3u8");
      FakeLoader.respond("#EXTM3U");
    }
    expect(processManifest).not.toHaveBeenCalled();
  });

  it("gives the core the playlists that name streams, and no others", () => {
    // HLS.js routes every playlist through this loader. A subtitle track is
    // one no master declares as a stream, so the core would register the
    // WebVTT playlist as a stream of its own.
    const { load, processManifest } = playlistLoader();

    for (const type of ["manifest", "level", "audioTrack"]) {
      load(type);
      FakeLoader.respond("#EXTM3U");
    }
    expect(processManifest).toHaveBeenCalledTimes(3);

    load("subtitleTrack", "https://cdn.example/hls/subs-en.m3u8");
    FakeLoader.respond("#EXTM3U\n#EXT-X-TARGETDURATION:6");
    expect(processManifest).toHaveBeenCalledTimes(3);
  });
});
