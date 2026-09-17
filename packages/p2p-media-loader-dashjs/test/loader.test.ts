import { describe, expect, it, vi } from "vitest";
import { CoreRequestError, type Core } from "p2p-media-loader-core";
import { createXhrLoaderExtension } from "../src/loader.js";
import type {
  CommonMediaRequestLike,
  CommonMediaResponseLike,
  FactoryMakerThis,
  ProgressEventLike,
} from "../src/types.js";

const MPD_URL = "https://cdn.example/dash/manifest.mpd";
const SEGMENT_URL = "https://cdn.example/dash/video/720p/5.m4s";

/** Builds the request/response pair dash.js's HTTPLoader hands a loader. */
function makeRequest(
  type: string,
  url: string,
  headers: Record<string, string> = {},
) {
  const events = {
    progress: [] as ProgressEventLike[],
    loadend: 0,
    abort: 0,
  };
  const request: CommonMediaRequestLike = {
    url,
    method: "GET",
    headers,
    customData: {
      request: { type, url },
      onloadend: () => void events.loadend++,
      onprogress: (event) => void events.progress.push(event),
      onabort: () => void events.abort++,
    },
  };
  const response: CommonMediaResponseLike = { status: 0 };
  return { request, response, events };
}

function setup(options: { loadable?: boolean; index?: boolean } = {}) {
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
  };
  /** dash.js's own XHRLoader: completes with whatever the test staged. */
  const parentResult: { status: number; data?: unknown; url?: string } = {
    status: 200,
  };
  const parent = {
    load: vi.fn(
      (request: CommonMediaRequestLike, response: CommonMediaResponseLike) => {
        response.status = parentResult.status;
        response.data = parentResult.data;
        response.url = parentResult.url;
        request.customData?.onloadend?.();
        return true;
      },
    ),
    abort: vi.fn(),
  };
  const onManifestProcessed = vi.fn();
  const extension = createXhrLoaderExtension(core as unknown as Core, {
    onManifestProcessed,
  });
  const loader = extension.call({
    context: {},
    factory: undefined,
    parent,
  } as FactoryMakerThis);
  return {
    loader,
    core,
    parent,
    parentResult,
    segmentData,
    onManifestProcessed,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("dash.js XHRLoader extension", () => {
  it("lets dash.js load the MPD and hands the bytes to the core first, under both URLs", () => {
    const { loader, core, parent, parentResult, onManifestProcessed } = setup();
    parentResult.data = "<MPD/>";
    parentResult.url = "https://cdn.example/dash/redirected.mpd";
    const { request, response, events } = makeRequest("MPD", MPD_URL);

    loader.load(request, response);

    expect(parent.load).toHaveBeenCalledTimes(1);
    expect(core.processManifest).toHaveBeenCalledWith({
      url: "https://cdn.example/dash/redirected.mpd",
      requestedUrl: MPD_URL,
      data: "<MPD/>",
    });
    expect(onManifestProcessed).toHaveBeenCalledWith({ streams: [] });
    // dash.js's own completion still runs, after the core saw the bytes.
    expect(events.loadend).toBe(1);
  });

  it("takes PatchLocation out of the MPD dash.js goes on to parse", () => {
    const { loader, core, parentResult } = setup();
    // Following it, dash.js would refresh by patch, which the core cannot
    // read, and the registry would freeze at this window.
    parentResult.data = `<MPD><PatchLocation ttl="60">patch.mpp</PatchLocation><Period/></MPD>`;
    const { request, response } = makeRequest("MPD", MPD_URL);

    loader.load(request, response);

    expect(response.data).toBe("<MPD><Period/></MPD>");
    expect(core.processManifest).toHaveBeenCalledWith(
      expect.objectContaining({ data: "<MPD><Period/></MPD>" }),
    );
  });

  it("leaves an MPD without one exactly as dash.js received it", () => {
    const { loader, parentResult } = setup();
    parentResult.data = "<MPD><Period/></MPD>";
    const { request, response } = makeRequest("MPD", MPD_URL);
    loader.load(request, response);
    expect(response.data).toBe("<MPD><Period/></MPD>");
  });

  it("does not hand a failed MPD response to the core", () => {
    const { loader, core, parentResult } = setup();
    parentResult.status = 404;
    const { request, response } = makeRequest("MPD", MPD_URL);
    loader.load(request, response);
    expect(core.processManifest).not.toHaveBeenCalled();
  });

  it("lets dash.js fetch a stream's external index and hands the bytes to the core", () => {
    const { loader, core, parent, parentResult } = setup({ index: true });
    parentResult.data = new Uint8Array([1, 2, 3]).buffer;
    const { request, response } = makeRequest("IndexSegment", SEGMENT_URL, {
      Range: "bytes=786-1009",
    });

    loader.load(request, response);

    expect(core.isSegmentIndex).toHaveBeenCalledWith(SEGMENT_URL, {
      start: 786,
      end: 1009,
    });
    expect(parent.load).toHaveBeenCalledTimes(1);
    expect(core.processSegmentIndex).toHaveBeenCalledWith({
      url: SEGMENT_URL,
      byteRange: { start: 786, end: 1009 },
      data: parentResult.data,
    });
    expect(core.loadSegment).not.toHaveBeenCalled();
  });

  it("serves a known media segment through the core with a download-time trace dash.js can measure", async () => {
    const { loader, core, parent, segmentData } = setup({ loadable: true });
    const { request, response, events } = makeRequest(
      "MediaSegment",
      SEGMENT_URL,
      { Range: "bytes=0-699" },
    );

    expect(loader.load(request, response)).toBe(true);
    await flush();

    expect(parent.load).not.toHaveBeenCalled();
    expect(core.loadSegment).toHaveBeenCalledWith(SEGMENT_URL, {
      byteRange: { start: 0, end: 699 },
    });
    expect(response).toMatchObject({
      url: SEGMENT_URL,
      status: 200,
      statusText: "OK",
      headers: {},
    });
    expect(response.data).toBe(segmentData);
    // dash.js drops the first trace as latency and sums the rest; 1 MiB at
    // 8 Mbit/s is 1.048576 s.
    expect(events.progress).toEqual([
      { lengthComputable: true, loaded: 0, total: 1_048_576, time: 1 },
      {
        lengthComputable: true,
        loaded: 1_048_576,
        total: 1_048_576,
        time: 1049,
      },
    ]);
    expect(events.loadend).toBe(1);
  });

  it("passes segments the core does not serve, and every other request type, to dash.js untouched", () => {
    const { loader, core, parent } = setup({ loadable: false });
    for (const type of [
      "MediaSegment",
      "InitializationSegment",
      "license",
      "XLinkExpansion",
    ]) {
      const { request, response } = makeRequest(type, SEGMENT_URL);
      loader.load(request, response);
    }
    expect(parent.load).toHaveBeenCalledTimes(4);
    expect(core.loadSegment).not.toHaveBeenCalled();
    // Only media segments are looked up; init segments never are.
    expect(core.isSegmentLoadable).toHaveBeenCalledTimes(1);
  });

  it("aborts the core request when dash.js aborts, and reports the abort back", async () => {
    const { loader, core } = setup({ loadable: true });
    core.loadSegment.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          core.abortSegmentLoading.mockImplementationOnce(() =>
            reject(new CoreRequestError("aborted")),
          );
        }),
    );
    const { request, response, events } = makeRequest(
      "MediaSegment",
      SEGMENT_URL,
    );
    loader.load(request, response);

    request.customData?.abort?.();
    await flush();

    expect(core.abortSegmentLoading).toHaveBeenCalledWith(
      SEGMENT_URL,
      undefined,
    );
    expect(events.abort).toBe(1);
    expect(events.loadend).toBe(0);
  });

  it("reports an abort, not a download, for a segment that arrives after it", async () => {
    // The core cannot always cancel in time: a request still waiting for the
    // segment storage has no loader to carry the abort.
    const { loader } = setup({ loadable: true });
    const { request, response, events } = makeRequest(
      "MediaSegment",
      SEGMENT_URL,
    );
    loader.load(request, response);

    request.customData?.abort?.();
    await flush();

    expect(events.abort).toBe(1);
    expect(events.loadend).toBe(0);
    expect(events.progress).toEqual([]);
    expect(response.data).toBeUndefined();
  });

  it("reports a core failure as a failed response so dash.js retries", async () => {
    const { loader, core } = setup({ loadable: true });
    core.loadSegment.mockRejectedValueOnce(
      new CoreRequestError("failed", "peers and http both failed"),
    );
    const { request, response, events } = makeRequest(
      "MediaSegment",
      SEGMENT_URL,
    );
    loader.load(request, response);
    await flush();

    expect(response.status).toBe(0);
    expect(response.statusText).toBe("peers and http both failed");
    expect(events.loadend).toBe(1);
    expect(events.abort).toBe(0);
  });

  it("still reaches dash.js's loader after FactoryMaker copies the override onto it", () => {
    // FactoryMaker's `override` merge assigns the returned methods onto the
    // parent instance; the extension must have kept the originals or every
    // pass-through would call itself.
    const { core, parentResult } = setup();
    const originalLoad = vi.fn(
      (request: CommonMediaRequestLike, response: CommonMediaResponseLike) => {
        response.status = parentResult.status;
        request.customData?.onloadend?.();
        return true;
      },
    );
    const parent = { load: originalLoad, abort: vi.fn() };
    const extension = createXhrLoaderExtension(core as unknown as Core);
    const overrides = extension.call({
      context: {},
      factory: undefined,
      parent,
    } as FactoryMakerThis);
    Object.assign(parent, overrides); // what FactoryMaker does

    const { request, response, events } = makeRequest("license", SEGMENT_URL);
    expect(parent.load(request, response)).toBe(true);
    expect(originalLoad).toHaveBeenCalledTimes(1);
    expect(events.loadend).toBe(1);
  });

  it("forwards abort() to dash.js's loader as well", () => {
    const { loader, parent } = setup();
    loader.abort();
    expect(parent.abort).toHaveBeenCalledTimes(1);
  });
});
