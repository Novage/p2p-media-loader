import { describe, expect, it, vi } from "vitest";
import { CoreRequestError, type Core } from "p2p-media-loader-core";
import { RequestRouter, RouterRegistry, createVhsXhr } from "../src/xhr.js";
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

    driven.open?.("GET", options.uri, true);
    for (const [name, value] of Object.entries(request.headers)) {
      if (value !== undefined) driven.setRequestHeader?.(name, value);
    }
    driven.send?.(null);

    if (!options.xhr) pending.push({ request, complete });
    return request;
  });
}

function hookRegistry(fn: VhsXhr): VhsXhr {
  fn.onRequest = (cb: VhsRequestHook) => {
    (fn._requestCallbackSet ??= new Set()).add(cb);
  };
  fn.offRequest = (cb: VhsRequestHook) => fn._requestCallbackSet?.delete(cb);
  fn.onResponse = (cb: VhsResponseHook) => {
    (fn._responseCallbackSet ??= new Set()).add(cb);
  };
  fn.offResponse = (cb: VhsResponseHook) => fn._responseCallbackSet?.delete(cb);
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
  const original = hookRegistry(
    Object.assign(vi.fn(), { original: true }) as unknown as VhsXhr,
  );
  const videojs = {
    xhr: videojsXhr,
    Vhs: { xhr: original },
    registerPlugin: vi.fn(),
    getPlugin: vi.fn(),
    deregisterPlugin: vi.fn(),
  } as unknown as VideoJsLike;

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
  const player = {
    tech: () => ({ el: () => null, vhs: { xhr: playerXhr } }),
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

  return {
    router,
    core,
    videojs,
    videojsXhr,
    respond,
    segmentData,
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
    installGlobalHook: () => {
      videojs.Vhs.xhr = createVhsXhr(videojs, registry, original);
      return videojs.Vhs.xhr;
    },
    setSrc: (value: string) => (src = value),
    newHandler: () => (playerXhr = createPlayerXhr(videojs)),
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
      data: "#EXTM3U",
    });

    router.ensureTopLevelManifest();
    expect(videojsXhr).toHaveBeenCalledTimes(1);
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

    setSrc("https://cdn.example/other/master.m3u8");
    newHandler(); // a new source brings a new VHS handler
    router.ensureTopLevelManifest();
    expect(core.destroy).toHaveBeenCalledTimes(1);
  });
});

describe("the global videojs.Vhs.xhr replacement", () => {
  it("carries VHS's hook registry over so onRequest keeps working", () => {
    const { installGlobalHook } = setup();
    const replacement = installGlobalHook();
    expect(replacement.original).not.toBe(true);
    expect(typeof replacement.onRequest).toBe("function");
    expect(typeof replacement.offRequest).toBe("function");
  });

  it("passes a request from a player with no engine to videojs.xhr untouched", () => {
    const { installGlobalHook, videojsXhr, core } = setup();
    const replacement = installGlobalHook();
    replacement(
      { uri: "https://elsewhere.example/x.m3u8", requestType: "hls-playlist" },
      vi.fn(),
    );
    expect(videojsXhr).toHaveBeenCalledTimes(1);
    expect(core.processManifest).not.toHaveBeenCalled();
  });

  it("catches the first manifest of a source, so nothing is fetched twice", () => {
    const { router, core, videojsXhr, request, respond, installGlobalHook } =
      setup();
    installGlobalHook();
    // VHS sends this one from inside its source handler, before any hook.
    request({ uri: MASTER, requestType: "hls-playlist" });
    respond(200, "#EXTM3U", "https://cdn.example/hls/redirected.m3u8");
    expect(core.processManifest).toHaveBeenCalledWith({
      url: "https://cdn.example/hls/redirected.m3u8",
      data: "#EXTM3U",
    });

    // The player's hooks are on now, so binding reads no manifest of its own.
    router.ensureTopLevelManifest();
    expect(videojsXhr).toHaveBeenCalledTimes(1);
  });

  it("hands a top-level refresh to the core exactly once", () => {
    const { core, request, respond, installGlobalHook } = setup();
    installGlobalHook();
    request({ uri: MASTER, requestType: "hls-playlist" });
    respond(200, "#EXTM3U");
    request({ uri: MASTER, requestType: "hls-playlist" });
    respond(200, "#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:2");
    expect(core.processManifest).toHaveBeenCalledTimes(2);
  });
});
