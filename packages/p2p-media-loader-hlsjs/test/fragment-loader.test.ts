import { describe, expect, it, vi } from "vitest";
import type {
  FragmentLoaderContext,
  HlsConfig,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
} from "hls.js";
import type { Core } from "p2p-media-loader-core";
import { FragmentLoaderBase } from "../src/fragment-loader.js";

const URL = "https://cdn.example/vod/media.mp4";

class FakeDefaultLoader {
  static instances: FakeDefaultLoader[] = [];
  stats = {};
  load = vi.fn();
  abort = vi.fn();
  destroy = vi.fn();
  constructor() {
    FakeDefaultLoader.instances.push(this);
  }
}

function setup(loadable: boolean) {
  const data = new Uint8Array([1, 2, 3]).buffer;
  const core = {
    isSegmentLoadable: vi.fn(() => loadable),
    loadSegment: vi.fn(() => Promise.resolve({ data, bandwidth: 8_000_000 })),
    abortSegmentLoading: vi.fn(),
  };
  FakeDefaultLoader.instances = [];
  const config = { loader: FakeDefaultLoader } as unknown as HlsConfig;
  const loader = new FragmentLoaderBase(config, core as unknown as Core);
  const callbacks = {
    onSuccess: vi.fn(),
    onError: vi.fn(),
    onProgress: vi.fn(),
    onAbort: vi.fn(),
  } as unknown as LoaderCallbacks<LoaderContext>;
  return { core, loader, callbacks, data };
}

const context = (rangeStart?: number, rangeEnd?: number) =>
  ({ url: URL, rangeStart, rangeEnd }) as FragmentLoaderContext;
const loaderConfig = {} as LoaderConfiguration;

describe("HLS.js fragment loader", () => {
  it("asks the core by URL and inclusive byte range, converting HLS.js's half-open range", async () => {
    const { core, loader, callbacks, data } = setup(true);
    loader.load(context(600, 1600), loaderConfig, callbacks);

    expect(core.isSegmentLoadable).toHaveBeenCalledWith(URL, {
      start: 600,
      end: 1599,
    });
    expect(core.loadSegment).toHaveBeenCalledWith(URL, {
      byteRange: { start: 600, end: 1599 },
    });
    expect(FakeDefaultLoader.instances).toHaveLength(0);

    await Promise.resolve();
    expect(callbacks.onSuccess).toHaveBeenCalledTimes(1);
    const [response] = vi.mocked(callbacks.onSuccess).mock.calls[0];
    // What the core hands over is already the engine's own copy, so it goes
    // to HLS.js as it is — which is free to transfer it to its worker. The
    // core's guarantee is covered by its own tests.
    expect(response.data).toBe(data);
  });

  it("passes a fragment without a range as a plain URL", () => {
    const { core, loader, callbacks } = setup(true);
    loader.load(context(), loaderConfig, callbacks);
    expect(core.isSegmentLoadable).toHaveBeenCalledWith(URL, undefined);
  });

  it("falls back to HLS.js's own loader when the core does not serve the fragment", () => {
    const { core, loader, callbacks } = setup(false);
    const ctx = context(0, 100);
    loader.load(ctx, loaderConfig, callbacks);

    expect(core.loadSegment).not.toHaveBeenCalled();
    expect(FakeDefaultLoader.instances).toHaveLength(1);
    expect(FakeDefaultLoader.instances[0].load).toHaveBeenCalledWith(
      ctx,
      loaderConfig,
      callbacks,
    );
  });

  it("aborts through the core with the same URL and range", () => {
    const { core, loader, callbacks } = setup(true);
    loader.load(context(600, 1600), loaderConfig, callbacks);
    loader.abort();
    expect(core.abortSegmentLoading).toHaveBeenCalledWith(URL, {
      start: 600,
      end: 1599,
    });
    expect(callbacks.onAbort).toHaveBeenCalled();
  });

  it("delivers nothing for a fragment it has already reported as aborted", async () => {
    const { loader, callbacks } = setup(true);
    loader.load(context(600, 1600), loaderConfig, callbacks);
    loader.abort();

    // The core cannot always cancel in time — a request still waiting for the
    // segment storage has no loader yet — and HLS.js has been told this
    // fragment was aborted.
    await Promise.resolve();
    await Promise.resolve();
    expect(callbacks.onSuccess).not.toHaveBeenCalled();
    expect(callbacks.onProgress).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });
});
