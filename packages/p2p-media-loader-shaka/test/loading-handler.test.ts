import { describe, expect, it, vi } from "vitest";
import { CoreRequestError, type Core } from "p2p-media-loader-core";
import { Loader } from "../src/loading-handler.js";
import type { Shaka } from "../src/types.js";

const RequestType = { MANIFEST: 0, SEGMENT: 1, LICENSE: 2, KEY: 3 };

class FakeAbortableOperation<T> {
  constructor(
    readonly promise: Promise<T>,
    readonly onAbort: () => Promise<void>,
  ) {}
  abort() {
    return this.onAbort();
  }
}

class FakeShakaError extends Error {
  static Severity = { RECOVERABLE: 1 };
  static Category = { NETWORK: 1 };
  static Code = { OPERATION_ABORTED: 7001, HTTP_ERROR: 1002 };
  readonly data: unknown[];
  constructor(
    readonly severity: number,
    readonly category: number,
    readonly code: number,
    ...data: unknown[]
  ) {
    super(`shaka error ${code}`);
    this.data = data;
  }
}

function setup(loadable = true, fetchSupported = true) {
  const manifestResponse = {
    uri: "https://cdn.example/final/master.m3u8",
    data: new TextEncoder().encode("#EXTM3U").buffer,
  };
  const parse = vi.fn(() => ({
    promise: Promise.resolve(manifestResponse),
    abort: () => Promise.resolve(),
  }));
  const xhrParse = vi.fn(() => ({
    promise: Promise.resolve(manifestResponse),
    abort: () => Promise.resolve(),
  }));
  const dataParse = vi.fn(() => ({
    promise: Promise.resolve(manifestResponse),
    abort: () => Promise.resolve(),
  }));
  const shaka = {
    net: {
      NetworkingEngine: { RequestType },
      HttpFetchPlugin: { parse, isSupported: () => fetchSupported },
      HttpXHRPlugin: { parse: xhrParse },
      DataUriPlugin: { parse: dataParse },
    },
    util: { AbortableOperation: FakeAbortableOperation, Error: FakeShakaError },
  } as unknown as Shaka;

  const data = new Uint8Array([9, 9]).buffer;
  const processed = { streams: [] };
  /**
   * What the core makes of the presentation once an index is read — told
   * apart from a manifest's summary, so an assertion pins which one arrived.
   */
  const indexed = {
    streams: [
      {
        key: "https://cdn.example/v/1080p.mp4",
        type: "main" as const,
        isLive: true,
        start: 0,
        end: 120,
        segmentCount: 20,
      },
    ],
  };
  const onManifestProcessed = vi.fn();
  const core = {
    processManifest: vi.fn(() => processed),
    isSegmentIndex: vi.fn(() => false),
    processSegmentIndex: vi.fn(() => indexed),
    isSegmentLoadable: vi.fn(() => loadable),
    loadSegment: vi.fn(() => Promise.resolve({ data, bandwidth: 1_000_000 })),
    abortSegmentLoading: vi.fn(),
  };
  /** The presentation playing now, as the engine reports it. */
  let source: object | undefined = {};
  /** As Shaka does, a loader per request — built when the request is sent. */
  const makeLoader = () =>
    new Loader(
      shaka,
      core as unknown as Core,
      () => source,
      onManifestProcessed,
    );
  const loader = makeLoader();
  /** The engine letting the player go. */
  const release = () => (source = undefined);
  /** The same player loading another source. */
  const startNewSource = () => (source = {});

  return {
    loader,
    makeLoader,
    core,
    release,
    startNewSource,
    indexed,
    parse,
    xhrParse,
    dataParse,
    manifestResponse,
    data,
    processed,
    onManifestProcessed,
  };
}

const request = (headers: Record<string, string> = {}) =>
  ({ headers }) as unknown as Parameters<Loader["load"]>[1];
const url = "https://cdn.example/seg.m4s";

describe("Shaka loading handler", () => {
  it("hands every manifest response to the core and lets Shaka load it", async () => {
    const { loader, core, parse, manifestResponse } = setup();
    const op = loader.load(url, request(), RequestType.MANIFEST);
    await op.promise;
    expect(parse).toHaveBeenCalledTimes(1);
    expect(core.processManifest).toHaveBeenCalledWith({
      url: manifestResponse.uri,
      data: manifestResponse.data,
    });
  });

  it("takes PatchLocation out of the MPD Shaka goes on to parse", async () => {
    const { loader, core, manifestResponse } = setup();
    // Following it, Shaka would refresh by patch, which the core cannot read,
    // and the registry would freeze at this window.
    manifestResponse.data = new TextEncoder().encode(
      `<MPD><PatchLocation ttl="60">patch.mpp</PatchLocation><Period/></MPD>`,
    ).buffer;

    const response = await loader.load(url, request(), RequestType.MANIFEST)
      .promise;

    expect(new TextDecoder().decode(response.data)).toBe(
      "<MPD><Period/></MPD>",
    );
    expect(core.processManifest).toHaveBeenCalledWith(
      expect.objectContaining({ data: response.data }),
    );
  });

  it("gives the core nothing once the engine has moved on", async () => {
    // A live manifest refreshes every few seconds, so one is usually in
    // flight when the integrator switches player or source. Read into a core
    // that now serves another presentation it registers streams nothing
    // plays — and, winning the race with that presentation's own first
    // manifest, names the swarm after a stream this player never asked for.
    const { loader, core, release } = setup();
    const loading = loader.load(url, request(), RequestType.MANIFEST);
    release();

    await loading.promise;
    await Promise.resolve();

    expect(core.processManifest).not.toHaveBeenCalled();
  });

  it("gives the core nothing when it was made for no presentation", async () => {
    // Shaka separates the filter that stamps a request from the scheme
    // plugin that sends it by an await, and by a whole backoff on a retry, so
    // a request can be built after the engine has already let the player go.
    const { core, onManifestProcessed, release, makeLoader } = setup();
    release();
    const built = makeLoader();
    core.isSegmentIndex.mockReturnValue(true);

    await built.load(url, request({ Range: "bytes=0-99" }), RequestType.SEGMENT)
      .promise;
    await built.load(url, request(), RequestType.MANIFEST).promise;
    await Promise.resolve();

    expect(core.processSegmentIndex).not.toHaveBeenCalled();
    expect(core.processManifest).not.toHaveBeenCalled();
    expect(onManifestProcessed).not.toHaveBeenCalled();
  });

  it("gives the core nothing from the source before this one", async () => {
    // The same player loading another source. A live manifest refreshes every
    // few seconds, so one is usually in flight at the switch — and the core
    // has just been emptied for the source that is starting.
    const { loader, core, onManifestProcessed, startNewSource } = setup();
    const loading = loader.load(url, request(), RequestType.MANIFEST);
    startNewSource();

    await loading.promise;
    await Promise.resolve();

    expect(core.processManifest).not.toHaveBeenCalled();
    expect(onManifestProcessed).not.toHaveBeenCalled();
  });

  it("gives the core no segment index once the engine has moved on", async () => {
    const { loader, core, release } = setup();
    core.isSegmentIndex.mockReturnValue(true);
    const loading = loader.load(
      url,
      request({ Range: "bytes=0-99" }),
      RequestType.SEGMENT,
    );
    release();

    await loading.promise;
    await Promise.resolve();

    expect(core.processSegmentIndex).not.toHaveBeenCalled();
  });

  it("leaves a manifest without one byte for byte as Shaka received it", async () => {
    const { loader, manifestResponse } = setup();
    const data = manifestResponse.data;
    const response = await loader.load(url, request(), RequestType.MANIFEST)
      .promise;
    expect(response.data).toBe(data);
  });

  it("hands what the core read from a manifest to the engine", async () => {
    const { loader, onManifestProcessed, processed } = setup();
    await loader.load(url, request(), RequestType.MANIFEST).promise;
    await Promise.resolve();
    expect(onManifestProcessed).toHaveBeenCalledWith(processed);
  });

  it("hands what the core read from a segment index to the engine", async () => {
    // A `SegmentBase` live stream registers from its MPD with no segments at
    // all, so nothing there can size a live window. The index is the first
    // description of the presentation that can, and the core answers with all
    // of it — dropping that leaves the player at the pre-manifest delay for
    // the session.
    const { loader, core, onManifestProcessed, indexed } = setup();
    core.isSegmentIndex.mockReturnValue(true);

    await loader.load(
      url,
      request({ Range: "bytes=0-99" }),
      RequestType.SEGMENT,
    ).promise;
    await Promise.resolve();

    expect(core.processSegmentIndex).toHaveBeenCalled();
    expect(onManifestProcessed).toHaveBeenCalledWith(indexed);
  });

  it("serves a known segment through the core, reading the byte range from the Range header", async () => {
    const { loader, core, parse, data } = setup(true);
    const op = loader.load(
      url,
      request({ Range: "bytes=0-699" }),
      RequestType.SEGMENT,
    );
    const response = await op.promise;

    expect(core.isSegmentLoadable).toHaveBeenCalledWith(url, {
      start: 0,
      end: 699,
    });
    expect(core.loadSegment).toHaveBeenCalledWith(url, {
      byteRange: { start: 0, end: 699 },
    });
    expect(parse).not.toHaveBeenCalled();
    expect(response.data).toBe(data);
    expect(response.uri).toBe(url);
  });

  it("tells Shaka a download time in milliseconds derived from the core's bandwidth hint, never 0", async () => {
    const { loader, core } = setup();
    const oneMiB = new Uint8Array(1_048_576).buffer;
    core.loadSegment.mockResolvedValueOnce({
      data: oneMiB,
      bandwidth: 8_000_000,
    });
    let response = await loader.load(url, request(), RequestType.SEGMENT)
      .promise;
    // 8 388 608 bits at 8 Mbit/s → 1.048576 s.
    expect(response.timeMs).toBe(1049);

    // Sub-millisecond and unknown-bandwidth cases floor at 1 ms: a 0 ms
    // sample poisons Shaka's EWMA estimator with NaN.
    core.loadSegment.mockResolvedValueOnce({
      data: new Uint8Array(2).buffer,
      bandwidth: 1_000_000,
    });
    response = await loader.load(url, request(), RequestType.SEGMENT).promise;
    expect(response.timeMs).toBe(1);
    core.loadSegment.mockResolvedValueOnce({ data: oneMiB, bandwidth: 0 });
    response = await loader.load(url, request(), RequestType.SEGMENT).promise;
    expect(response.timeMs).toBe(1);
  });

  it("translates a core failure into a recoverable Shaka network error carrying the cause", async () => {
    const { loader, core } = setup();
    const failure = new CoreRequestError("failed", "peer and http both failed");
    core.loadSegment.mockRejectedValueOnce(failure);
    const error = (await loader
      .load(url, request(), RequestType.SEGMENT)
      .promise.catch((e: unknown) => e)) as FakeShakaError;
    expect(error).toBeInstanceOf(FakeShakaError);
    expect(error.severity).toBe(FakeShakaError.Severity.RECOVERABLE);
    expect(error.code).toBe(FakeShakaError.Code.HTTP_ERROR);
    expect(error.data).toEqual([url, failure, RequestType.SEGMENT]);
  });

  it("falls back to Shaka's fetch for a segment the core does not serve", () => {
    const { loader, core, parse } = setup(false);
    loader.load(url, request(), RequestType.SEGMENT);
    expect(core.isSegmentLoadable).toHaveBeenCalledWith(url, undefined);
    expect(core.loadSegment).not.toHaveBeenCalled();
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("aborts a core request with the same URL and range, and delivers nothing after it", async () => {
    const { loader, core } = setup(true);
    const op = loader.load(
      url,
      request({ Range: "bytes=0-699" }),
      RequestType.SEGMENT,
    );
    await op.abort();
    expect(core.abortSegmentLoading).toHaveBeenCalledWith(url, {
      start: 0,
      end: 699,
    });
    // The core cannot always cancel in time — a request still waiting for the
    // segment storage has no loader yet — and a segment that arrives anyway
    // is reported to Shaka as the abort it asked for, not as a download.
    await expect(op.promise).rejects.toMatchObject({
      code: FakeShakaError.Code.OPERATION_ABORTED,
    });
  });

  it("lets Shaka fetch a stream's external index and hands the bytes to the core", async () => {
    const { loader, core, parse, manifestResponse } = setup(false);
    core.isSegmentIndex.mockReturnValue(true);
    const op = loader.load(
      url,
      request({ Range: "bytes=786-1009" }),
      RequestType.SEGMENT,
    );
    await op.promise;
    await Promise.resolve();
    expect(parse).toHaveBeenCalledTimes(1);
    expect(core.loadSegment).not.toHaveBeenCalled();
    expect(core.processSegmentIndex).toHaveBeenCalledWith({
      url,
      byteRange: { start: 786, end: 1009 },
      data: manifestResponse.data,
    });
  });

  it("falls back to Shaka's XHR plugin where the fetch plugin is unsupported", async () => {
    // Old Smart TV browsers: fetch without AbortController. Shaka itself
    // registers XHR there; forcing fetch throws inside Shaka.
    const { loader, parse, xhrParse, core } = setup(true, false);
    await loader.load(url, request(), RequestType.MANIFEST).promise;
    expect(xhrParse).toHaveBeenCalledTimes(1);
    expect(parse).not.toHaveBeenCalled();
    expect(core.processManifest).toHaveBeenCalledTimes(1);
  });

  it("decodes a data URI with the plugin Shaka uses for one", async () => {
    // Shaka registers `data:` to a plugin that decodes it with no network
    // stack. The adapter's own registration takes that scheme over, so it
    // makes the same choice — and an XHR cannot open a data URI at all.
    for (const fetchSupported of [true, false]) {
      const { loader, parse, xhrParse, dataParse, core } = setup(
        true,
        fetchSupported,
      );
      await loader.load(
        "data:application/dash+xml;base64,PE1QRC8+",
        request(),
        RequestType.MANIFEST,
      ).promise;
      expect(dataParse).toHaveBeenCalledTimes(1);
      expect(parse).not.toHaveBeenCalled();
      expect(xhrParse).not.toHaveBeenCalled();
      expect(core.processManifest).toHaveBeenCalledTimes(1);
    }
  });

  it("passes licence and key requests through without consulting the core", () => {
    // The whitelist from specs/encryption.md: only manifests and segments
    // are handled; everything else is Shaka's business.
    for (const type of [RequestType.LICENSE, RequestType.KEY]) {
      const { loader, core, parse } = setup();
      loader.load("https://drm.example/license", request(), type);
      expect(parse).toHaveBeenCalledTimes(1);
      expect(core.processManifest).not.toHaveBeenCalled();
      expect(core.isSegmentLoadable).not.toHaveBeenCalled();
      expect(core.loadSegment).not.toHaveBeenCalled();
    }
  });
});
