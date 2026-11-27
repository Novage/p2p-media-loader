import { describe, expect, it, vi } from "vitest";
import type {
  FragmentLoaderContext,
  HlsConfig,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
} from "hls.js";
import {
  CoreRequestError,
  RequestError,
  type Core,
} from "p2p-media-loader-core";
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

function setup(loadable: boolean, extraConfig: Record<string, unknown> = {}) {
  const data = new Uint8Array([1, 2, 3]).buffer;
  const core = {
    isSegmentLoadable: vi.fn(() => loadable),
    loadSegment: vi.fn(() => Promise.resolve({ data, bandwidth: 8_000_000 })),
    abortSegmentLoading: vi.fn(),
  };
  FakeDefaultLoader.instances = [];
  const config = {
    loader: FakeDefaultLoader,
    ...extraConfig,
  } as unknown as HlsConfig;
  const order: string[] = [];
  core.loadSegment.mockImplementation(() => {
    order.push("request");
    return Promise.resolve({ data, bandwidth: 8_000_000 });
  });
  const loader = new FragmentLoaderBase(config, core as unknown as Core, () =>
    order.push("report"),
  );
  const callbacks = {
    onSuccess: vi.fn(),
    onError: vi.fn(),
    onProgress: vi.fn(),
    onAbort: vi.fn(),
  } as unknown as LoaderCallbacks<LoaderContext>;
  return { core, loader, callbacks, data, order };
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

  it("reports the player's buffer just before it asks the core", () => {
    // HLS.js asks right after it appends a fragment; no media element event
    // has told the core of that append.
    const { loader, callbacks, order } = setup(true);
    loader.load(context(), loaderConfig, callbacks);

    expect(order).toEqual(["report", "request"]);
  });

  it("reports nothing for a fragment it leaves to HLS.js", () => {
    const { loader, callbacks, order } = setup(false);
    loader.load(context(), loaderConfig, callbacks);

    expect(order).toEqual([]);
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

describe("HLS.js fragment loader when the core does not deliver", () => {
  /** The code and text HLS.js is given for a core failure. */
  async function reported(failure: CoreRequestError) {
    const { core, loader, callbacks } = setup(true);
    core.loadSegment.mockImplementation(() => Promise.reject(failure));
    loader.load(context(), loaderConfig, callbacks);
    await Promise.resolve();
    await Promise.resolve();

    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    const [response] = vi.mocked(callbacks.onError).mock.calls[0];
    return response;
  }

  it("reports a core failure with no HTTP status as one HLS.js retries", async () => {
    // A timeout: HLS.js retries a fragment by its status and never one with
    // none — status 0 reads as a CORS failure, which on a stream of one
    // rendition is fatal.
    const response = await reported(
      new CoreRequestError(
        "failed",
        "timed out",
        new RequestError("bytes-receiving-timeout", "timed out"),
      ),
    );

    // HLS.js's retryForHttpStatus: anything but none and 4xx is retried.
    expect(response.code).toBe(502);
    expect(response.text).toBe("timed out");
  });

  it("hands a fragment the core threw on to HLS.js's loader", async () => {
    // Core.loadSegment throws a plain Error for a segment the window left
    // while the storage started, or a storage that failed to start. Each
    // retry would go to the same core, though the origin may work.
    const { core, loader, callbacks } = setup(true);
    core.loadSegment.mockImplementation(() =>
      Promise.reject(new Error("segment is not in the registry")),
    );
    loader.load(context(), loaderConfig, callbacks);
    await Promise.resolve();
    await Promise.resolve();

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(FakeDefaultLoader.instances).toHaveLength(1);
    expect(FakeDefaultLoader.instances[0].load).toHaveBeenCalledTimes(1);
  });

  it("reports nothing for a fragment HLS.js aborted before the core failed it", async () => {
    const { core, loader, callbacks } = setup(true);
    core.loadSegment.mockImplementation(() =>
      Promise.reject(new CoreRequestError("failed")),
    );
    loader.load(context(), loaderConfig, callbacks);
    loader.abort();
    await Promise.resolve();
    await Promise.resolve();

    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it.each([404, 503])(
    "reports a core failure with the %i the origin gave, as HLS.js's own loader would",
    async (status) => {
      // HLS.js retries a 503, and not a 404, as it does without P2P.
      const response = await reported(
        new CoreRequestError(
          "failed",
          "refused",
          new RequestError("http-error", "refused", undefined, status),
          status,
        ),
      );

      expect(response.code).toBe(status);
    },
  );

  it("hands a fragment the core stopped on its own to HLS.js's loader", async () => {
    // P2P turned off for the stream, or the core destroyed, while HLS.js
    // waited for the fragment: HLS.js never asked to stop it, and an error
    // would count against the fragment.
    const { core, loader, callbacks } = setup(true);
    core.loadSegment.mockImplementation(() =>
      Promise.reject(new CoreRequestError("aborted")),
    );
    const ctx = context(0, 100);
    loader.load(ctx, loaderConfig, callbacks);
    await Promise.resolve();
    await Promise.resolve();

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(FakeDefaultLoader.instances).toHaveLength(1);
    expect(FakeDefaultLoader.instances[0].load).toHaveBeenCalledWith(
      ctx,
      loaderConfig,
      callbacks,
    );

    loader.abort();
    expect(FakeDefaultLoader.instances[0].abort).toHaveBeenCalled();
    expect(core.abortSegmentLoading).not.toHaveBeenCalled();
  });

  it("hands nothing on once HLS.js has let the fragment go", async () => {
    const { core, loader, callbacks } = setup(true);
    core.loadSegment.mockImplementation(() =>
      Promise.reject(new CoreRequestError("aborted")),
    );
    loader.load(context(), loaderConfig, callbacks);
    loader.destroy();
    await Promise.resolve();
    await Promise.resolve();

    expect(FakeDefaultLoader.instances).toHaveLength(0);
    expect(callbacks.onError).not.toHaveBeenCalled();
  });
});

describe("HLS.js fragment loader for an interstitial", () => {
  it("never serves a fragment of an ad from the core", () => {
    // HLS.js plays an ad break with a second instance built from this one's
    // config, so it carries this loader and this core. Even a URL the
    // registry knows belongs to the presentation the core holds, not to the
    // ad: an interstitial's player fetches its own fragments itself.
    const { core, loader, callbacks } = setup(true, {
      primarySessionId: "s1",
      assetPlayerId: "interstitial-1",
    });

    loader.load(context(), loaderConfig, callbacks);

    expect(core.loadSegment).not.toHaveBeenCalled();
    expect(FakeDefaultLoader.instances).toHaveLength(1);
    expect(FakeDefaultLoader.instances[0].load).toHaveBeenCalledTimes(1);
  });
});
