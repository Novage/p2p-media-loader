import { describe, expect, it, vi } from "vitest";
import type { Core } from "p2p-media-loader-core";
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
  static Code = { OPERATION_ABORTED: 7001 };
  constructor(
    readonly severity: number,
    readonly category: number,
    readonly code: number,
  ) {
    super(`shaka error ${code}`);
  }
}

function setup(loadable = true) {
  const manifestResponse = {
    uri: "https://cdn.example/final/master.m3u8",
    data: new TextEncoder().encode("#EXTM3U").buffer,
  };
  const parse = vi.fn(() => ({
    promise: Promise.resolve(manifestResponse),
    abort: () => Promise.resolve(),
  }));
  const shaka = {
    net: { NetworkingEngine: { RequestType }, HttpFetchPlugin: { parse } },
    util: { AbortableOperation: FakeAbortableOperation, Error: FakeShakaError },
  } as unknown as Shaka;

  const data = new Uint8Array([9, 9]).buffer;
  const processed = { streams: [] };
  const onManifestProcessed = vi.fn();
  const core = {
    processManifest: vi.fn(() => processed),
    isSegmentLoadable: vi.fn(() => loadable),
    loadSegment: vi.fn(() => Promise.resolve({ data, bandwidth: 1_000_000 })),
    abortSegmentLoading: vi.fn(),
  };
  const loader = new Loader(
    shaka,
    core as unknown as Core,
    onManifestProcessed,
  );
  return {
    loader,
    core,
    parse,
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

  it("hands what the core read from a manifest to the engine", async () => {
    const { loader, onManifestProcessed, processed } = setup();
    await loader.load(url, request(), RequestType.MANIFEST).promise;
    await Promise.resolve();
    expect(onManifestProcessed).toHaveBeenCalledWith(processed);
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

  it("falls back to Shaka's fetch for a segment the core does not serve", () => {
    const { loader, core, parse } = setup(false);
    loader.load(url, request(), RequestType.SEGMENT);
    expect(core.isSegmentLoadable).toHaveBeenCalledWith(url, undefined);
    expect(core.loadSegment).not.toHaveBeenCalled();
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("aborts a core request with the same URL and range", async () => {
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
