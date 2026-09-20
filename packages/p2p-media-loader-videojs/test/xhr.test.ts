import { describe, expect, it, vi } from "vitest";
import { hookRegistry } from "./helpers.js";
import { CoreRequestError, type Core } from "p2p-media-loader-core";
import {
  FirstManifestHooks,
  RequestRouter,
  RouterRegistry,
} from "../src/xhr.js";
import type {
  VhsCallback,
  VhsRequest,
  VhsRequestHook,
  VhsRequestOptions,
  VhsResponse,
  VhsResponseHook,
  VhsXhr,
  VideoJsLike,
  VideoJsPlayerLike,
} from "../src/types.js";

const MASTER = "https://cdn.example/hls/master.m3u8";
const MEDIA = "https://cdn.example/hls/720p/index.m3u8";
const SEGMENT = "https://cdn.example/hls/720p/5.ts";

/**
 * A request object as `videojs.xhr` builds one when the caller supplies
 * none: what the browser would have filled in is filled in by `respond`.
 */
type PlainRequest = VhsRequest & {
  responseText?: string;
  response?: unknown;
};

type Pending = {
  request: PlainRequest;
  complete: (error: Error | null, response: VhsResponse) => void;
};

/**
 * A stand-in for `@videojs/xhr`, which is what `videojs.xhr` is: it drives
 * the object in `options.xhr` when there is one — opening it, setting its
 * headers and response type, sending it, and reading the result off it when
 * it completes — and otherwise makes its own request.
 */
function createLibraryXhr(pending: Pending[]) {
  return vi.fn((options: VhsRequestOptions, callback: VhsCallback) => {
    const request: PlainRequest = (options.xhr as PlainRequest | undefined) ?? {
      abort: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const driven = request as PlainRequest & {
      open?: (method: string, url: string, async: boolean) => void;
      send?: (body: unknown) => void;
      setRequestHeader?: (name: string, value: string) => void;
      onload?: (() => void) | null;
      onerror?: ((error: Error) => void) | null;
      onabort?: (() => void) | null;
    };

    request.headers = options.headers ?? {};
    if ("responseType" in options) request.responseType = options.responseType;

    let aborted = false;
    let called = false;
    const complete = (error: Error | null, response: VhsResponse) => {
      if (called || (aborted && !error)) return;
      called = true;
      callback(error, response);
    };
    driven.onload = () => {
      if (aborted) return;
      complete(null, {
        statusCode: request.status ?? 0,
        headers: {},
        body: request.response ?? request.responseText,
        rawRequest: request,
      });
    };
    driven.onerror = (error: Error) =>
      complete(error, { statusCode: 0, headers: {}, rawRequest: request });
    driven.onabort = () => (aborted = true);

    // What `@videojs/xhr` writes onto the object it drives, before sending.
    (driven as unknown as { url?: string }).url = options.uri;
    driven.open?.("GET", options.uri, true);
    for (const [name, value] of Object.entries(request.headers)) {
      if (value !== undefined) driven.setRequestHeader?.(name, value);
    }
    driven.send?.(null);

    if (!options.xhr) pending.push({ request, complete });
    return request;
  });
}

/**
 * The page-wide xhr function as VHS builds one. Its hook methods close over
 * VHS's own namespace — `Vhs.xhr.offRequest = cb => removeOnRequestHook(Vhs.xhr, cb)`
 * — so they act on whatever is page-wide when they are called, not on the
 * function they were put on. A fake that closed over the function instead
 * would hide what happens once that function is replaced.
 */
function pageHookRegistry(fn: VhsXhr, current: () => VhsXhr): VhsXhr {
  const drop = (
    key: "_requestCallbackSet" | "_responseCallbackSet",
    cb: never,
  ) => {
    const xhr = current();
    const set = xhr[key] as Set<never> | undefined;
    if (!set) return;
    set.delete(cb);
    if (!set.size) delete xhr[key];
  };
  fn.onRequest = (cb: VhsRequestHook) => {
    (current()._requestCallbackSet ??= new Set()).add(cb);
  };
  fn.offRequest = (cb: VhsRequestHook) =>
    drop("_requestCallbackSet", cb as never);
  fn.onResponse = (cb: VhsResponseHook) => {
    (current()._responseCallbackSet ??= new Set()).add(cb);
  };
  fn.offResponse = (cb: VhsResponseHook) =>
    drop("_responseCallbackSet", cb as never);
  return fn;
}

/**
 * A stand-in for the `XhrFunction` VHS builds for each player: it runs the
 * request hooks, calls `videojs.Vhs.xhr` unless that is still VHS's own, runs
 * the response hooks, and hands VHS's callback the request object — keeping a
 * bandwidth the request already carries, as VHS's callback wrapper does.
 */
function createPlayerXhr(videojs: VideoJsLike): VhsXhr {
  const fn = function XhrFunction(
    options: VhsRequestOptions,
    callback: (error: Error | null, request: VhsRequest) => void,
  ) {
    const requestSet =
      fn._requestCallbackSet ?? videojs.Vhs.xhr._requestCallbackSet;
    const responseSet =
      fn._responseCallbackSet ?? videojs.Vhs.xhr._responseCallbackSet;
    let prepared = options;
    requestSet?.forEach((hook) => (prepared = hook(prepared)));

    const xhrMethod =
      videojs.Vhs.xhr.original === true ? videojs.xhr : videojs.Vhs.xhr;
    const request = xhrMethod(prepared, (error, response) => {
      responseSet?.forEach((hook) => hook(request, error, response));
      const body =
        request.responseType === "arraybuffer"
          ? request.response
          : request.responseText;
      if (!error && body !== undefined && !request.bandwidth) {
        request.bandwidth = 1; // measured from the clock, as VHS would
      }
      callback(error, request);
    });
    const abort = request.abort.bind(request);
    request.abort = () => {
      request.aborted = true;
      abort();
    };
    request.uri = options.uri;
    request.requestType = options.requestType;
    request.requestTime = Date.now();
    return request;
  } as unknown as VhsXhr;
  return hookRegistry(fn);
}

function setup(options: { loadable?: boolean; index?: boolean } = {}) {
  const pending: Pending[] = [];
  const videojsXhr = createLibraryXhr(pending);
  const videojs = {
    xhr: videojsXhr,
    Vhs: { xhr: undefined as unknown as VhsXhr },
    registerPlugin: vi.fn(),
    getPlugin: vi.fn(),
    deregisterPlugin: vi.fn(),
  } as unknown as VideoJsLike;
  const original = pageHookRegistry(
    Object.assign(vi.fn(), { original: true }) as unknown as VhsXhr,
    () => videojs.Vhs.xhr,
  );
  videojs.Vhs.xhr = original;

  /** Completes the oldest request `videojs.xhr` made itself. */
  const respond = (status: number, data: unknown, responseURL?: string) => {
    const item = pending.shift()!;
    if (item.request.responseType === "arraybuffer")
      item.request.response = data;
    else item.request.responseText = data as string;
    item.request.status = status;
    if (responseURL) item.request.responseURL = responseURL;
    item.complete(status >= 400 ? new Error("failed") : null, {
      statusCode: status,
      headers: {},
      body: data,
      rawRequest: item.request,
    });
  };

  let src = MASTER;
  let playerXhr = createPlayerXhr(videojs);
  let withCredentials = false;
  let bandwidth: number | undefined = 4_194_304;
  let handler = true;
  let handled = MASTER;
  let held = false;
  const player = {
    tech: () => ({
      el: () => null,
      // VHS puts the handler on the tech when it takes a source on, and the
      // one before it stays there until then — so the player can carry a
      // source with no handler, or with the previous source's.
      vhs: handler
        ? {
            xhr: playerXhr,
            bandwidth,
            source_: { src: handled },
            playlistController_: { loadOnPlay_: held ? () => undefined : null },
            options_: { withCredentials },
          }
        : undefined,
    }),
    currentSrc: () => src,
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as VideoJsPlayerLike;

  const segmentData = new Uint8Array(1_048_576).buffer;
  const core = {
    processManifest: vi.fn(() => ({ streams: [] })),
    processSegmentIndex: vi.fn(),
    isSegmentIndex: vi.fn(() => options.index ?? false),
    isSegmentLoadable: vi.fn(() => options.loadable ?? false),
    loadSegment: vi.fn(() =>
      Promise.resolve({ data: segmentData, bandwidth: 8_000_000 }),
    ),
    abortSegmentLoading: vi.fn(),
    destroy: vi.fn(),
  };

  const registry = new RouterRegistry();
  const router = new RequestRouter(core as unknown as Core, player, videojs);
  registry.add(router);
  const hooks = new FirstManifestHooks(registry);

  return {
    router,
    registry,
    hooks,
    core,
    videojs,
    videojsXhr,
    player,
    respond,
    segmentData,
    original,
    /** What the player is playing now, as `player.src(...)` would change it. */
    setSrc: (next: string) => (src = next),
    /** Whether VHS sends this player's playlist requests with credentials. */
    setWithCredentials: (value: boolean) => (withCredentials = value),
    /** Whether VHS has taken the player's source on yet. */
    setHandler: (value: boolean) => (handler = value),
    /** The source the handler on the tech was created for. */
    setHandled: (value: string) => (handled = value),
    /** Whether VHS is holding the manifest request back, as `preload="none"`. */
    setLoadHeld: (value: boolean) => (held = value),
    /** The xhr function of the player's current VHS handler. */
    playerHooks: () => playerXhr,
    /** VHS's own bandwidth estimate, as its handler carries it. */
    setVhsBandwidth: (value: number | undefined) => (bandwidth = value),
    /** A request as VHS makes it, through the player's own xhr function. */
    request: (o: VhsRequestOptions, callback = vi.fn()) => ({
      request: (
        playerXhr as unknown as (
          o: VhsRequestOptions,
          cb: (error: Error | null, request: VhsRequest) => void,
        ) => VhsRequest
      )(o, callback),
      callback,
    }),
    installPageHooks: () => hooks.retain(videojs),
    /** VHS taking a new source on: a new handler, with a new xhr function. */
    newHandler: (next?: string) => {
      playerXhr = createPlayerXhr(videojs);
      if (next !== undefined) handled = next;
      return playerXhr;
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a player's own VHS hooks", () => {
  it("reads the manifest VHS fetched before binding, once per source", () => {
    const { router, core, videojsXhr, respond } = setup();
    router.ensureTopLevelManifest();
    expect(videojsXhr).toHaveBeenCalledTimes(1);
    respond(200, "#EXTM3U", "https://cdn.example/hls/redirected.m3u8");
    expect(core.processManifest).toHaveBeenCalledWith({
      url: "https://cdn.example/hls/redirected.m3u8",
      requestedUrl: MASTER,
      data: "#EXTM3U",
    });

    router.ensureTopLevelManifest();
    expect(videojsXhr).toHaveBeenCalledTimes(1);
  });

  it("drops a manifest that arrives after the player moved on", () => {
    const { router, core, setSrc, newHandler, respond } = setup();
    router.ensureTopLevelManifest();

    // The integrator loads another source while that fetch is in flight. Its
    // response would otherwise name the swarm after the source left behind,
    // and every viewer of the new one would be in a swarm of their own.
    const SECOND = "https://cdn.example/hls/second.m3u8";
    setSrc(SECOND);
    newHandler(SECOND);
    router.ensureTopLevelManifest();
    respond(200, "#EXTM3U");

    expect(core.processManifest).not.toHaveBeenCalled();
  });

  it("drops a manifest that arrives after the engine let the player go", () => {
    const { router, core, respond } = setup();
    router.ensureTopLevelManifest();

    router.detachHooks();
    respond(200, "#EXTM3U");

    expect(core.processManifest).not.toHaveBeenCalled();
  });

  it("asks for the manifest the way VHS asks for it", () => {
    const { router, videojsXhr, setWithCredentials } = setup();
    setWithCredentials(true);

    router.ensureTopLevelManifest();

    expect(videojsXhr).toHaveBeenCalledWith(
      expect.objectContaining({ withCredentials: true, timeout: 20_000 }),
      expect.any(Function),
    );
  });

  it("lets a failed read be tried again", () => {
    const { router, videojsXhr, respond } = setup();
    router.ensureTopLevelManifest();
    respond(500, "");

    // A source noted as read but never read blocks every later attempt.
    router.ensureTopLevelManifest();
    expect(videojsXhr).toHaveBeenCalledTimes(2);
  });

  it("serves the segment it checked, whatever a later hook does to the URI", async () => {
    // An integrator's signing hook runs after this adapter's, and
    // `@videojs/xhr` writes the rewritten URI onto the object it drives — so
    // the core would be asked for a URL its registry never saw.
    const { router, core, player, request } = setup({ loadable: true });
    router.attachHooks();
    // Added after this adapter's, on the same player, as an integrator's is.
    const playerXhr = (player.tech(true) as unknown as { vhs: { xhr: VhsXhr } })
      .vhs.xhr;
    playerXhr.onRequest?.((options) => ({
      ...options,
      uri: `${options.uri}?token=signed-later`,
    }));

    request({ uri: SEGMENT, requestType: "segment" });
    await flush();

    expect(core.loadSegment).toHaveBeenCalledWith(SEGMENT, {
      byteRange: undefined,
    });
  });

  it("keeps VHS's own estimate when the core has measured nothing yet", async () => {
    // The core reports 0 until it has a sample, which is every session's
    // first segment. VHS fills an empty `bandwidth` by dividing the bytes by
    // the time they took, and a segment out of storage takes none of it —
    // `Infinity`, which VHS saves and reads back as room for any rendition.
    const { router, core, request, setVhsBandwidth } = setup({
      loadable: true,
    });
    router.attachHooks();
    core.loadSegment.mockResolvedValue({
      data: new ArrayBuffer(1024),
      bandwidth: 0,
    });
    setVhsBandwidth(3_000_000);

    const { request: served } = request({
      uri: SEGMENT,
      requestType: "segment",
    });
    await flush();
    expect(served.bandwidth).toBe(3_000_000);

    // Once the core has one of its own, that is what VHS is told.
    core.loadSegment.mockResolvedValue({
      data: new ArrayBuffer(1024),
      bandwidth: 7_500_000.4,
    });
    const { request: next } = request({
      uri: SEGMENT,
      requestType: "segment",
    });
    await flush();
    expect(next.bandwidth).toBe(7_500_000);
  });

  it("leaves a bandwidth VHS cannot use alone, so it measures again", async () => {
    // VHS's own estimate goes to `Infinity` on a segment the browser cache
    // answers instantly, and to `NaN` from a Network Information API with no
    // `downlink`. Handing either back would pin it there for the session,
    // since VHS keeps a bandwidth the request already carries.
    const { router, core, request, setVhsBandwidth } = setup({
      loadable: true,
    });
    router.attachHooks();
    core.loadSegment.mockResolvedValue({
      data: new ArrayBuffer(1024),
      bandwidth: 0,
    });

    setVhsBandwidth(Number.POSITIVE_INFINITY);
    const { request: first } = request({
      uri: SEGMENT,
      requestType: "segment",
    });
    await flush();
    expect(first.bandwidth).toBeUndefined();

    setVhsBandwidth(Number.NaN);
    const { request: second } = request({
      uri: SEGMENT,
      requestType: "segment",
    });
    await flush();
    expect(second.bandwidth).toBeUndefined();
  });

  it("lets the core go when the player is left on no source at all", () => {
    // `player.reset()` clears the source and disposes the handler. A context
    // for a stream no player is on seeds it to nobody's benefit.
    const { router, core, respond, setSrc, setHandler } = setup();
    router.ensureTopLevelManifest();
    respond(200, "#EXTM3U");
    expect(core.destroy).not.toHaveBeenCalled();

    setSrc("");
    setHandler(false);
    router.ensureTopLevelManifest();
    expect(core.destroy).toHaveBeenCalledTimes(1);
  });

  it("does not guess between two players on one source", () => {
    // VHS's page-wide hooks say nothing about which player asked, so a second
    // bound player on the same source is a second answer to one question:
    // handing the manifest to the first would feed a player that never asked
    // for it, and leave the other with none. Each reads its own instead.
    const { router, registry, core, videojs } = setup();
    expect(registry.findBySrc(MASTER)).toBe(router);

    const second = new RequestRouter(
      core as unknown as Core,
      {
        currentSrc: () => MASTER,
        tech: () => undefined,
        on: vi.fn(),
        off: vi.fn(),
      } as unknown as VideoJsPlayerLike,
      videojs,
    );
    registry.add(second);

    expect(registry.findBySrc(MASTER)).toBeUndefined();
  });

  it("hands every playlist and MPD to the core, but not a failed one", () => {
    const { router, core, request, respond } = setup();
    router.ensureTopLevelManifest();
    respond(200, "#EXTM3U"); // the top-level manifest read on binding
    expect(core.processManifest).toHaveBeenCalledTimes(1);

    request({ uri: MEDIA, requestType: "hls-playlist" });
    respond(200, "#EXTM3U\n#EXT-X-TARGETDURATION:6");
    request({
      uri: "https://cdn.example/dash/m.mpd",
      requestType: "dash-manifest",
    });
    respond(200, "<MPD/>");
    request({ uri: MEDIA, requestType: "hls-playlist" });
    respond(404, "not found");
    expect(core.processManifest).toHaveBeenCalledTimes(3);
  });

  it("serves a known segment through the core and keeps the bandwidth it reports", async () => {
    const { router, core, videojsXhr, request, segmentData } = setup({
      loadable: true,
    });
    router.ensureTopLevelManifest();
    const { request: served, callback } = request({
      uri: SEGMENT,
      requestType: "segment",
      responseType: "arraybuffer",
      headers: { Range: "bytes=0-699" },
    });
    await flush();

    expect(core.loadSegment).toHaveBeenCalledWith(SEGMENT, {
      byteRange: { start: 0, end: 699 },
    });
    // The served object went to videojs.xhr as the request to drive.
    expect(videojsXhr.mock.calls.at(-1)?.[0].xhr).toBe(served);
    expect(served).toMatchObject({
      uri: SEGMENT,
      requestType: "segment",
      responseType: "arraybuffer",
      responseURL: SEGMENT,
      status: 200,
      bandwidth: 8_000_000,
      aborted: false,
    });
    expect(served.response).toBe(segmentData);
    expect(callback).toHaveBeenCalledWith(null, served);
  });

  it("aborts the core request when VHS aborts, and completes for nobody", async () => {
    const { router, core, request } = setup({ loadable: true });
    core.loadSegment.mockImplementationOnce(() => new Promise(() => undefined));
    router.ensureTopLevelManifest();
    const { request: served, callback } = request({
      uri: SEGMENT,
      requestType: "segment",
      responseType: "arraybuffer",
      headers: { Range: "bytes=0-699" },
    });

    served.abort();
    await flush();
    expect(core.abortSegmentLoading).toHaveBeenCalledWith(SEGMENT, {
      start: 0,
      end: 699,
    });
    expect(served.aborted).toBe(true);
    // An aborted XMLHttpRequest calls nothing back; VHS finishes it itself.
    expect(callback).not.toHaveBeenCalled();
    served.abort();
    expect(core.abortSegmentLoading).toHaveBeenCalledTimes(1);
  });

  it("delivers nothing for a segment that arrives after the abort", async () => {
    // The core cannot always cancel in time: a request still waiting for the
    // segment storage has no loader to carry the abort.
    const { router, core, request, segmentData } = setup({ loadable: true });
    router.ensureTopLevelManifest();
    const { request: served, callback } = request({
      uri: SEGMENT,
      requestType: "segment",
      responseType: "arraybuffer",
    });

    served.abort();
    await flush();
    expect(core.loadSegment).toHaveBeenCalledTimes(1);
    expect(served.response).not.toBe(segmentData);
    expect(served.status).toBe(0);
    expect(callback).not.toHaveBeenCalled();
  });

  it("reports a core failure as an errored request so VHS applies its own retries", async () => {
    const { router, core, request } = setup({ loadable: true });
    core.loadSegment.mockRejectedValueOnce(
      new CoreRequestError("failed", "peers and http both failed"),
    );
    router.ensureTopLevelManifest();
    const { request: served, callback } = request({
      uri: SEGMENT,
      requestType: "segment",
      responseType: "arraybuffer",
    });
    await flush();

    expect(served.status).toBe(0);
    expect(served.aborted).toBe(false);
    const [error] = callback.mock.calls[0] as [Error];
    expect(error.message).toBe("peers and http both failed");
  });

  it("leaves segments the core does not hold, init segments and keys alone", () => {
    const { router, core, videojsXhr, request } = setup({ loadable: false });
    router.ensureTopLevelManifest();
    request({
      uri: SEGMENT,
      requestType: "segment",
      responseType: "arraybuffer",
    });
    request({
      uri: "https://cdn.example/init.mp4",
      requestType: "segment-media-initialization",
      responseType: "arraybuffer",
    });
    request({
      uri: "https://cdn.example/key",
      requestType: "segment-key",
      responseType: "arraybuffer",
    });

    expect(core.loadSegment).not.toHaveBeenCalled();
    expect(core.isSegmentLoadable).toHaveBeenCalledTimes(1);
    for (const [options] of videojsXhr.mock.calls.slice(1)) {
      expect(options.xhr).toBeUndefined();
    }
  });

  it("hands a SegmentBase index to the core and does not serve it", () => {
    const { router, core, request, respond } = setup({ index: true });
    router.ensureTopLevelManifest();
    respond(200, "#EXTM3U");
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    request({
      uri: "https://cdn.example/dash/v.mp4",
      requestType: "dash-sidx",
      responseType: "arraybuffer",
      headers: { Range: "bytes=786-1009" },
    });
    respond(200, bytes);

    expect(core.processSegmentIndex).toHaveBeenCalledWith({
      url: "https://cdn.example/dash/v.mp4",
      byteRange: { start: 786, end: 1009 },
      data: bytes,
    });
    expect(core.loadSegment).not.toHaveBeenCalled();
  });

  it("starts a new stream context when the source changes, not on a refresh", () => {
    const { router, core, request, respond, setSrc, newHandler } = setup();
    router.ensureTopLevelManifest();
    respond(200, "#EXTM3U");
    request({ uri: MEDIA, requestType: "hls-playlist" });
    respond(200, "#EXTM3U");
    expect(core.destroy).not.toHaveBeenCalled();

    const OTHER = "https://cdn.example/other/master.m3u8";
    setSrc(OTHER);
    newHandler(OTHER); // a new source brings a new VHS handler
    router.ensureTopLevelManifest();
    expect(core.destroy).toHaveBeenCalledTimes(1);
  });
});

describe("the page-wide hooks for a source's first manifest", () => {
  it("reads the manifest VHS fetched itself, so nothing is fetched twice", () => {
    const { router, core, videojsXhr, request, respond, installPageHooks } =
      setup();
    expect(installPageHooks()).toBeDefined();

    // VHS sends this one from inside its source handler, before the player
    // has hooks of its own, so VHS runs the page-wide ones.
    request({ uri: MASTER, requestType: "hls-playlist" });
    respond(200, "#EXTM3U", "https://cdn.example/hls/redirected.m3u8");
    expect(core.processManifest).toHaveBeenCalledWith({
      url: "https://cdn.example/hls/redirected.m3u8",
      requestedUrl: MASTER,
      data: "#EXTM3U",
    });
    expect(videojsXhr).toHaveBeenCalledTimes(1);

    // The player's own hooks are on now, so binding reads no manifest itself.
    router.ensureTopLevelManifest();
    expect(videojsXhr).toHaveBeenCalledTimes(1);
  });

  it("leaves the first manifest to VHS when it has not taken the source on", () => {
    // `player.src(...)` caches the source and hands it to the tech a tick
    // later, so an engine can bind in between: the source is there, the VHS
    // handler is not. Fetching the manifest here would read one response
    // while VHS reads another of the same URL — two sets of media playlists
    // from a CDN that signs them, and neither the set the player asks for.
    const {
      router,
      core,
      videojsXhr,
      request,
      respond,
      installPageHooks,
      setHandler,
    } = setup();
    installPageHooks();
    setHandler(false);

    router.ensureTopLevelManifest();
    expect(videojsXhr).not.toHaveBeenCalled();

    // VHS creates the handler and asks for the manifest; the page-wide hooks
    // read it, and it is read once.
    setHandler(true);
    request({ uri: MASTER, requestType: "hls-playlist" });
    respond(200, "#EXTM3U");
    expect(core.processManifest).toHaveBeenCalledTimes(1);
    expect(videojsXhr).toHaveBeenCalledTimes(1);

    // And binding again reads nothing more.
    router.ensureTopLevelManifest();
    expect(videojsXhr).toHaveBeenCalledTimes(1);
    expect(core.processManifest).toHaveBeenCalledTimes(1);
  });

  it("waits for a manifest VHS holds back, rather than fetching one", () => {
    // With `preload="none"` VHS creates the handler and its hooks but holds
    // the manifest request until playback starts — long after `loadstart`,
    // where the fallback would otherwise step in and fetch a manifest the
    // player was told not to load, for the core to read twice.
    const { router, core, videojsXhr, request, respond, setHandler } = setup();
    setHandler(false);
    router.ensureTopLevelManifest();

    // VHS takes the source on and announces the hooks; no request yet.
    setHandler(true);
    router.expectFirstManifest();
    expect(videojsXhr).not.toHaveBeenCalled();

    // `loadstart`, still with nothing asked for.
    router.ensureTopLevelManifest();
    expect(videojsXhr).not.toHaveBeenCalled();

    // The viewer presses play and VHS finally asks.
    request({ uri: MASTER, requestType: "hls-playlist" });
    respond(200, "#EXTM3U");
    expect(core.processManifest).toHaveBeenCalledTimes(1);
    expect(videojsXhr).toHaveBeenCalledTimes(1);
  });

  it("leaves the first manifest to VHS while the old handler is still there", () => {
    // `player.src(B)` on a player already playing A: the new source is the
    // player's at once, but the tech keeps A's handler until a tick later.
    // A handler is not the handler, and reading the manifest on the strength
    // of the wrong one costs the same second response as reading it with none.
    const { router, core, videojsXhr, request, respond, setSrc, newHandler } =
      setup();
    const NEXT = "https://cdn.example/hls/next.m3u8";
    setSrc(NEXT);

    router.ensureTopLevelManifest();
    expect(videojsXhr).not.toHaveBeenCalled();

    // The tech takes the new source on and VHS asks for its manifest.
    newHandler(NEXT);
    router.expectFirstManifest();
    request({ uri: NEXT, requestType: "hls-playlist" });
    respond(200, "#EXTM3U");
    expect(core.processManifest).toHaveBeenCalledTimes(1);
    expect(videojsXhr).toHaveBeenCalledTimes(1);
  });

  it("lets go of the xhr function of every source it has left behind", () => {
    // VHS gives each source a fresh xhr function whose hook methods close
    // over that source's handler, so one kept here keeps a disposed handler.
    const { router, newHandler } = setup();
    router.attachHooks();
    const attached = router as unknown as { hooked: Set<VhsXhr> };
    const [firstXhr] = attached.hooked;
    expect(firstXhr._requestCallbackSet?.size).toBe(1);

    const secondXhr = newHandler("https://cdn.example/hls/next.m3u8");
    router.attachHooks();
    expect(attached.hooked.size).toBe(1);
    expect(attached.hooked.has(secondXhr)).toBe(true);
    expect(firstXhr._requestCallbackSet?.size ?? 0).toBe(0);
    expect(firstXhr._responseCallbackSet?.size ?? 0).toBe(0);
  });

  it("lets the core go when the player moves to a source VHS cannot play", () => {
    // A progressive MP4, or native HLS on Safari, reaches no VHS handler and
    // so no manifest hook. The core still has to stop holding the stream the
    // player has left, or the peer announces and seeds it for as long as the
    // page lives while the player shows something else.
    const { router, core, videojsXhr, respond, setSrc, setHandler } = setup();
    router.ensureTopLevelManifest();
    respond(200, "#EXTM3U");
    expect(core.destroy).not.toHaveBeenCalled();

    setSrc("https://cdn.example/movie.mp4");
    setHandler(false);
    router.ensureTopLevelManifest();

    expect(core.destroy).toHaveBeenCalledTimes(1);
    // And nothing was fetched for it: there is no manifest to read.
    expect(videojsXhr).toHaveBeenCalledTimes(1);
  });

  it("lets the core go when VHS takes a source on, not when it asks", () => {
    // Under `preload="none"` VHS holds the manifest request until playback
    // starts. Waiting for it to reset the core would leave the peer on the
    // old stream until the viewer presses play, and for ever if they do not.
    const { router, core, videojsXhr, respond, setSrc, newHandler } = setup();
    router.ensureTopLevelManifest();
    respond(200, "#EXTM3U");
    expect(core.destroy).not.toHaveBeenCalled();

    const NEXT = "https://cdn.example/hls/next.m3u8";
    setSrc(NEXT);
    newHandler(NEXT);
    router.expectFirstManifest();

    expect(core.destroy).toHaveBeenCalledTimes(1);
    // Still nothing fetched: the request VHS holds back is VHS's to make.
    expect(videojsXhr).toHaveBeenCalledTimes(1);
    router.ensureTopLevelManifest();
    expect(videojsXhr).toHaveBeenCalledTimes(1);
  });

  it("pins the source the handler was built for, not the player's newest", () => {
    // `player.src(A)` then `player.src(B)` before the tech has taken A on:
    // VHS builds A's handler and announces its hooks while `currentSrc()`
    // already reads B, and the request that follows is A's.
    const { router, core, setSrc } = setup();
    setSrc("https://cdn.example/hls/next.m3u8"); // the player has moved on
    router.expectFirstManifest(); // the handler is still MASTER's
    expect(core.destroy).not.toHaveBeenCalled();

    // Entering the player's newer source now ends the context entered for the
    // handler's, which is what says the handler's was the one taken on.
    router.ensureTopLevelManifest();
    expect(core.destroy).toHaveBeenCalledTimes(1);
  });

  it("lets go of a disposed handler's xhr when nothing replaces it", () => {
    // `player.reset()` disposes the tech and its handler and puts no other in
    // its place. The function left behind still holds that handler through
    // the hook methods bound to it.
    const { router, setHandler } = setup();
    router.attachHooks();
    const hooked = (router as unknown as { hooked: Set<VhsXhr> }).hooked;
    const [xhr] = hooked;
    expect(xhr._requestCallbackSet?.size).toBe(1);

    setHandler(false);
    router.attachHooks();

    expect(hooked.size).toBe(0);
    expect(xhr._requestCallbackSet?.size ?? 0).toBe(0);
    expect(xhr._responseCallbackSet?.size ?? 0).toBe(0);
  });

  it("does not fetch a manifest VHS is holding for the first play", () => {
    // Bound to a player that already has a handler for its source, which is
    // when the fallback is right — except under `preload="none"`, where VHS
    // has the source but has parked the request until playback starts.
    const { router, core, videojsXhr, request, respond, setLoadHeld } = setup();
    setLoadHeld(true);

    router.ensureTopLevelManifest();
    expect(videojsXhr).not.toHaveBeenCalled();
    router.ensureTopLevelManifest();
    expect(videojsXhr).not.toHaveBeenCalled();

    // The viewer presses play, VHS makes the request, the hooks read it once.
    setLoadHeld(false);
    request({ uri: MASTER, requestType: "hls-playlist" });
    respond(200, "#EXTM3U");
    expect(core.processManifest).toHaveBeenCalledTimes(1);
    expect(videojsXhr).toHaveBeenCalledTimes(1);
  });

  it("resets the core for the source that arrives, not the one announced", () => {
    // `player.src(A)` then `player.src(B)` before the tech has taken A on:
    // VHS builds A's handler and asks for A while the player already reads B.
    // Reading the player there would reset the core for B before B exists and
    // leave nothing to reset when VHS finally takes B on.
    const A = MASTER;
    const B = "https://cdn.example/hls/second.m3u8";
    const { router, core, request, respond, setSrc, newHandler } = setup();
    router.expectFirstManifest(); // A's handler announces its hooks
    setSrc(B); // the player has moved on already

    request({ uri: A, requestType: "hls-playlist" });
    respond(200, "#EXTM3U");
    expect(core.destroy).not.toHaveBeenCalled();

    // VHS takes B on: now the context changes, once.
    newHandler(B);
    router.expectFirstManifest();
    expect(core.destroy).toHaveBeenCalledTimes(1);
    request({ uri: B, requestType: "hls-playlist" });
    respond(200, "#EXTM3U");
    expect(core.destroy).toHaveBeenCalledTimes(1);
  });

  it("leaves a source even when the core fails to be torn down", () => {
    // An integrator's own segment storage is destroyed with the core and is
    // free to throw. Holding on to the source it was leaving would have the
    // router treat a later return to that source as no change at all.
    const { router, core, videojsXhr, respond, setSrc, setHandler } = setup();
    router.ensureTopLevelManifest();
    respond(200, "#EXTM3U");
    expect(videojsXhr).toHaveBeenCalledTimes(1);
    core.destroy.mockImplementation(() => {
      throw new Error("storage teardown failed");
    });

    setSrc("");
    setHandler(false);
    // Logged, not raised: the router's callers are VHS's hooks and the
    // player's events, where a throw would abort the player's own work.
    expect(() => router.ensureTopLevelManifest()).not.toThrow();

    // Coming back to it is a new context, and its manifest is read again —
    // rather than the router believing it never left.
    core.destroy.mockImplementation(() => undefined);
    setSrc(MASTER);
    setHandler(true);
    router.ensureTopLevelManifest();
    expect(videojsXhr).toHaveBeenCalledTimes(2);
  });

  it("keeps a source change going when the core fails to be torn down inside a request hook", () => {
    // VHS runs the request hooks inside the xhr call its playlist loader
    // made for the new source's manifest: a throw there would leave that
    // request never sent, and the player showing no error for it.
    const B = "https://cdn.example/hls/second.m3u8";
    const { router, core, request, respond, setSrc } = setup();
    router.ensureTopLevelManifest();
    respond(200, "#EXTM3U");
    core.destroy.mockImplementation(() => {
      throw new Error("storage teardown failed");
    });

    setSrc(B);
    expect(() =>
      request({ uri: B, requestType: "hls-playlist" }),
    ).not.toThrow();
    expect(core.destroy).toHaveBeenCalledTimes(1);
  });

  it("serves a retried segment again when @videojs/xhr drives the same request a second time", async () => {
    // The library's retry opens and sends the very object it was given the
    // first time; a request that stayed 'sent' would never load, never
    // error, and hold the segment until the library's own timeout.
    const { router, core, request } = setup({ loadable: true });
    router.attachHooks();
    core.loadSegment.mockRejectedValueOnce(new Error("first attempt failed"));
    const { request: served, callback } = request({
      uri: SEGMENT,
      requestType: "segment",
    });
    await flush();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(core.loadSegment).toHaveBeenCalledTimes(1);

    (served as unknown as { open(): void; send(): void }).open();
    (served as unknown as { open(): void; send(): void }).send();
    await flush();

    expect(core.loadSegment).toHaveBeenCalledTimes(2);
    expect(served.status).toBe(200);
  });

  it("hands a top-level refresh to the core exactly once", () => {
    const { core, request, respond, installPageHooks } = setup();
    installPageHooks();
    request({ uri: MASTER, requestType: "hls-playlist" });
    respond(200, "#EXTM3U");
    // From here the player's own hooks run instead of the page-wide ones.
    request({ uri: MASTER, requestType: "hls-playlist" });
    respond(200, "#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:2");
    expect(core.processManifest).toHaveBeenCalledTimes(2);
  });

  it("ignores a page-wide request once this player has hooks of its own", () => {
    // VHS runs the page-wide hooks only for a player with none of its own, so
    // a bound player on a VHS that announces its hooks never reaches them.
    // What does reach them is a second, unbound player on the same source —
    // whose manifest is a different response, naming different playlists on a
    // signing CDN, and is not this player's to read.
    const { router, core, hooks, videojs, request, respond } = setup();
    hooks.retain(videojs);
    router.expectFirstManifest(); // this player's own hooks go on

    // The other player has none, so VHS runs the page-wide pair for it.
    const pageRequest = videojs.Vhs.xhr._requestCallbackSet;
    pageRequest?.forEach((hook) =>
      hook({ uri: MASTER, requestType: "hls-playlist" }),
    );
    request({ uri: MASTER, requestType: "hls-playlist" });
    const page = videojs.Vhs.xhr._responseCallbackSet;
    page?.forEach((hook) =>
      hook({ uri: MASTER, requestType: "hls-playlist" } as VhsRequest, null, {
        statusCode: 200,
        headers: {},
        body: "#EXTM3U other player",
      }),
    );

    expect(core.processManifest).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: "#EXTM3U other player" }),
    );
    // This player's own manifest still reaches the core through its own hooks.
    respond(200, "#EXTM3U mine");
    expect(core.processManifest).toHaveBeenCalledWith(
      expect.objectContaining({ data: "#EXTM3U mine" }),
    );
  });

  it("stops waiting page-wide once it has read a manifest of its own", () => {
    // A page-wide request whose response never comes back — two bound players
    // on one source leave `findBySrc` with no answer — would otherwise leave
    // the URL waiting, and admit the next request another player makes for it.
    const { router, core, hooks, videojs, request, respond } = setup();
    hooks.retain(videojs);

    const requests = videojs.Vhs.xhr._requestCallbackSet;
    requests?.forEach((hook) =>
      hook({ uri: MASTER, requestType: "hls-playlist" }),
    );

    // Its response never arrives. This player's own hooks read the next one.
    request({ uri: MEDIA, requestType: "hls-playlist" });
    respond(200, "#EXTM3U mine");
    expect(core.processManifest).toHaveBeenCalledTimes(1);

    // Another player's response for the same URL is no longer awaited.
    const responses = videojs.Vhs.xhr._responseCallbackSet;
    responses?.forEach((hook) =>
      hook({ uri: MASTER, requestType: "hls-playlist" } as VhsRequest, null, {
        statusCode: 200,
        headers: {},
        body: "#EXTM3U another player",
      }),
    );
    expect(core.processManifest).toHaveBeenCalledTimes(1);
  });

  it("ignores a page-wide request while this player has no handler yet", () => {
    // `player.src(X)` puts X in `currentSrc()` at once but reaches the tech a
    // tick later. A second, unbound player already on X that asks in between
    // is matched by `findBySrc` — and its manifest is not this one's to read.
    const { router, core, hooks, videojs, setHandler } = setup();
    hooks.retain(videojs);
    setHandler(false);

    const requests = videojs.Vhs.xhr._requestCallbackSet;
    requests?.forEach((hook) =>
      hook({ uri: MASTER, requestType: "hls-playlist" }),
    );
    const responses = videojs.Vhs.xhr._responseCallbackSet;
    responses?.forEach((hook) =>
      hook({ uri: MASTER, requestType: "hls-playlist" } as VhsRequest, null, {
        statusCode: 200,
        headers: {},
        body: "#EXTM3U another player",
      }),
    );

    expect(core.processManifest).not.toHaveBeenCalled();
  });

  it("ignores a request from a player with no engine", () => {
    const { core, request, respond, installPageHooks, setSrc } = setup();
    installPageHooks();
    setSrc("https://elsewhere.example/other.m3u8");
    request({ uri: MASTER, requestType: "hls-playlist" });
    respond(200, "#EXTM3U");
    expect(core.processManifest).not.toHaveBeenCalled();
  });

  it("leaves the manifest to be read again when the first request fails", () => {
    const { router, core, videojsXhr, request, respond, installPageHooks } =
      setup();
    installPageHooks();
    request({ uri: MASTER, requestType: "hls-playlist" });
    respond(500, "nope");
    expect(core.processManifest).not.toHaveBeenCalled();

    router.ensureTopLevelManifest();
    expect(videojsXhr).toHaveBeenCalledTimes(2);
  });

  it("installs once for many engines and comes off with the last of them", () => {
    const { videojs, hooks, original } = setup();
    expect(hooks.retain(videojs)).toBe(original);
    expect(hooks.retain(videojs)).toBe(original);
    expect(original._requestCallbackSet?.size).toBe(1);
    expect(original._responseCallbackSet?.size).toBe(1);

    hooks.release(original);
    expect(original._requestCallbackSet?.size).toBe(1);
    hooks.release(original);
    expect(original._requestCallbackSet?.size ?? 0).toBe(0);
    expect(original._responseCallbackSet?.size ?? 0).toBe(0);
  });

  it("holds each xhr function on its own, and lets go of each", () => {
    // `videojs.Vhs.xhr` is built once per Video.js namespace, but an
    // integrator may replace it and a page may carry two namespaces. Counting
    // the two together would leave the first function hooked for good.
    const { videojs, hooks, original } = setup();
    const replacement = pageHookRegistry(
      Object.assign(vi.fn(), { original: false }) as unknown as VhsXhr,
      () => videojs.Vhs.xhr,
    );
    expect(hooks.retain(videojs)).toBe(original);

    videojs.Vhs.xhr = replacement;
    expect(hooks.retain(videojs)).toBe(replacement);
    expect(original._requestCallbackSet?.size).toBe(1);
    expect(replacement._requestCallbackSet?.size).toBe(1);

    // The engine that took the first one lets go of the first one.
    hooks.release(original);
    expect(original._requestCallbackSet?.size ?? 0).toBe(0);
    expect(replacement._requestCallbackSet?.size).toBe(1);
    hooks.release(replacement);
    expect(replacement._requestCallbackSet?.size ?? 0).toBe(0);
  });

  it("reports that it could not install on a Video.js without hooks", () => {
    const { videojs, hooks } = setup();
    videojs.Vhs.xhr = (() => undefined) as unknown as typeof videojs.Vhs.xhr;
    expect(hooks.retain(videojs)).toBeUndefined();
  });
});
