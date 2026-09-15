import { describe, expect, it, vi } from "vitest";
import { CoreRequestError, type Core } from "p2p-media-loader-core";
import { RequestRouter, RouterRegistry, createVhsXhr } from "../src/xhr.js";
import type {
  VhsCallback,
  VhsRequest,
  VhsRequestHook,
  VhsRequestOptions,
  VhsResponse,
  VhsXhr,
  VideoJsLike,
  VideoJsPlayerLike,
} from "../src/types.js";

const MASTER = "https://cdn.example/hls/master.m3u8";
const MEDIA = "https://cdn.example/hls/720p/index.m3u8";
const SEGMENT = "https://cdn.example/hls/720p/5.ts";

/** A VHS-style xhr function with the hook registry VHS attaches to one. */
function vhsStyleXhr(): VhsXhr {
  const fn = vi.fn() as unknown as VhsXhr;
  fn.original = true;
  fn.onRequest = (cb: VhsRequestHook) => {
    (fn._requestCallbackSet ??= new Set()).add(cb);
  };
  fn.offRequest = (cb: VhsRequestHook) => {
    fn._requestCallbackSet?.delete(cb);
  };
  return fn;
}

function setup(options: { loadable?: boolean; index?: boolean } = {}) {
  // videojs.xhr: records requests; the test completes them with respond().
  const pending: {
    request: VhsRequest & { response?: unknown; responseText?: string };
    callback: VhsCallback;
    options: VhsRequestOptions;
  }[] = [];
  const videojsXhr = vi.fn(
    (options: VhsRequestOptions, callback: VhsCallback) => {
      const request = {
        abort: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        uri: options.uri,
        responseType: options.responseType ?? "",
        responseURL: options.uri,
      } as VhsRequest & { response?: unknown; responseText?: string };
      pending.push({ request, callback, options });
      return request;
    },
  );
  const respond = (
    status: number,
    data: unknown,
    responseURL?: string,
  ): VhsResponse => {
    const item = pending.shift()!;
    if (item.request.responseType === "arraybuffer")
      item.request.response = data;
    else item.request.responseText = data as string;
    if (responseURL) item.request.responseURL = responseURL;
    const response = { statusCode: status, headers: {} };
    item.callback(status >= 400 ? new Error("failed") : null, response);
    return response;
  };

  const original = vhsStyleXhr();
  const videojs = {
    xhr: videojsXhr,
    Vhs: { xhr: original },
    registerPlugin: vi.fn(),
    getPlugin: vi.fn(),
    deregisterPlugin: vi.fn(),
  } as unknown as VideoJsLike;

  let src = MASTER;
  const playerXhr = vhsStyleXhr();
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
  const xhr = createVhsXhr(videojs, registry, original);
  const callback = vi.fn();
  const tagged = (o: VhsRequestOptions) => ({ ...o, p2pml: router });

  return {
    xhr,
    router,
    core,
    videojs,
    videojsXhr,
    playerXhr,
    respond,
    callback,
    tagged,
    segmentData,
    setSrc: (s: string) => (src = s),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("videojs.Vhs.xhr replacement", () => {
  it("carries VHS's hook registry over so onRequest keeps working", () => {
    const { xhr } = setup();
    expect(xhr.original).not.toBe(true);
    expect(typeof xhr.onRequest).toBe("function");
    expect(typeof xhr.offRequest).toBe("function");
  });

  it("passes an untagged request from an unknown player to videojs.xhr untouched", () => {
    const { xhr, videojsXhr, core, callback } = setup();
    xhr(
      { uri: "https://elsewhere.example/x.m3u8", requestType: "hls-playlist" },
      callback,
    );
    expect(videojsXhr).toHaveBeenCalledTimes(1);
    expect(core.processManifest).not.toHaveBeenCalled();
  });

  it("matches the first manifest request to its player by source URL and tags that player from then on", () => {
    const { xhr, core, playerXhr, respond, callback } = setup();
    xhr({ uri: MASTER, requestType: "hls-playlist" }, callback);
    // The tagging hook is now on the player's own VHS xhr.
    expect(playerXhr._requestCallbackSet?.size).toBe(1);
    const hook = Array.from(playerXhr._requestCallbackSet!)[0];
    expect(hook({ uri: MEDIA })).toMatchObject({
      uri: MEDIA,
      p2pml: expect.anything(),
    });

    respond(200, "#EXTM3U", "https://cdn.example/hls/redirected.m3u8");
    expect(core.processManifest).toHaveBeenCalledWith({
      url: "https://cdn.example/hls/redirected.m3u8",
      data: "#EXTM3U",
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("tees every playlist and MPD to the core, but not a failed one", () => {
    const { xhr, core, respond, callback, tagged } = setup();
    xhr(tagged({ uri: MEDIA, requestType: "hls-playlist" }), callback);
    respond(200, "#EXTM3U\n#EXT-X-TARGETDURATION:6");
    xhr(
      tagged({
        uri: "https://cdn.example/dash/m.mpd",
        requestType: "dash-manifest",
      }),
      callback,
    );
    respond(200, "<MPD/>");
    xhr(tagged({ uri: MEDIA, requestType: "hls-playlist" }), callback);
    respond(404, "not found");
    expect(core.processManifest).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it("starts a new stream context when the player's source changes, not on a refresh", () => {
    const { xhr, core, respond, callback, tagged, setSrc } = setup();
    xhr(tagged({ uri: MASTER, requestType: "hls-playlist" }), callback);
    respond(200, "#EXTM3U");
    xhr(tagged({ uri: MEDIA, requestType: "hls-playlist" }), callback);
    respond(200, "#EXTM3U");
    expect(core.destroy).not.toHaveBeenCalled();
    setSrc("https://cdn.example/other/master.m3u8");
    xhr(
      tagged({
        uri: "https://cdn.example/other/master.m3u8",
        requestType: "hls-playlist",
      }),
      callback,
    );
    expect(core.destroy).toHaveBeenCalledTimes(1);
  });

  it("lets VHS fetch a SegmentBase index and hands the bytes to the core", () => {
    const { xhr, core, respond, callback, tagged } = setup({ index: true });
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    xhr(
      tagged({
        uri: "https://cdn.example/dash/v.mp4",
        requestType: "dash-sidx",
        responseType: "arraybuffer",
        headers: { Range: "bytes=786-1009" },
      }),
      callback,
    );
    respond(200, bytes);
    expect(core.processSegmentIndex).toHaveBeenCalledWith({
      url: "https://cdn.example/dash/v.mp4",
      byteRange: { start: 786, end: 1009 },
      data: bytes,
    });
    expect(core.loadSegment).not.toHaveBeenCalled();
  });

  it("serves a known segment through the core and presets the bandwidth VHS would otherwise measure", async () => {
    const { xhr, core, videojsXhr, callback, tagged, segmentData } = setup({
      loadable: true,
    });
    const request = xhr(
      tagged({
        uri: SEGMENT,
        requestType: "segment",
        responseType: "arraybuffer",
        headers: { Range: "bytes=0-699" },
      }),
      callback,
    );
    await flush();
    expect(videojsXhr).not.toHaveBeenCalled();
    expect(core.loadSegment).toHaveBeenCalledWith(SEGMENT, {
      byteRange: { start: 0, end: 699 },
    });
    expect(request).toMatchObject({
      uri: SEGMENT,
      requestType: "segment",
      responseType: "arraybuffer",
      responseURL: SEGMENT,
      status: 200,
      bandwidth: 8_000_000,
      aborted: false,
    });
    expect(request.response).toBe(segmentData);
    expect(typeof request.requestTime).toBe("number");
    expect(callback).toHaveBeenCalledWith(null, {
      statusCode: 200,
      headers: {},
    });
  });

  it("passes segments the core does not serve, init segments and keys to videojs.xhr", () => {
    const { xhr, core, videojsXhr, callback, tagged } = setup({
      loadable: false,
    });
    xhr(
      tagged({
        uri: SEGMENT,
        requestType: "segment",
        responseType: "arraybuffer",
      }),
      callback,
    );
    xhr(
      tagged({
        uri: "https://cdn.example/init.mp4",
        requestType: "segment-media-initialization",
        responseType: "arraybuffer",
      }),
      callback,
    );
    xhr(
      tagged({
        uri: "https://cdn.example/key",
        requestType: "segment-key",
        responseType: "arraybuffer",
      }),
      callback,
    );
    expect(videojsXhr).toHaveBeenCalledTimes(3);
    expect(core.loadSegment).not.toHaveBeenCalled();
    expect(core.isSegmentLoadable).toHaveBeenCalledTimes(1);
  });

  it("aborts the core request when VHS aborts and reports it as aborted", async () => {
    const { xhr, core, callback, tagged } = setup({ loadable: true });
    core.loadSegment.mockImplementationOnce(() => new Promise(() => undefined));
    const request = xhr(
      tagged({
        uri: SEGMENT,
        requestType: "segment",
        responseType: "arraybuffer",
      }),
      callback,
    );
    request.abort();
    await flush();
    expect(core.abortSegmentLoading).toHaveBeenCalledWith(SEGMENT, undefined);
    expect(request.aborted).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
    // A second abort, as VHS's wrapper may issue, changes nothing.
    request.abort();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("reports a core failure as an errored request so VHS applies its own retries", async () => {
    const { xhr, core, callback, tagged } = setup({ loadable: true });
    core.loadSegment.mockRejectedValueOnce(
      new CoreRequestError("failed", "peers and http both failed"),
    );
    const request = xhr(
      tagged({
        uri: SEGMENT,
        requestType: "segment",
        responseType: "arraybuffer",
      }),
      callback,
    );
    await flush();
    expect(request.status).toBe(0);
    expect(request.aborted).toBe(false);
    const [error, response] = callback.mock.calls[0] as [Error, VhsResponse];
    expect(error.message).toBe("peers and http both failed");
    expect(response.statusCode).toBe(0);
  });
});
