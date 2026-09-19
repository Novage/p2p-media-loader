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
    manifest: { defaultPresentationDelay: 0, dash: {} },
    streaming: {},
  };
  const filters: shaka.extern.RequestFilter[] = [];
  const configure = vi.fn((path: string, value: unknown) => {
    if (path === "manifest.defaultPresentationDelay") {
      configuration.manifest.defaultPresentationDelay = value as number;
    }
  });
  const player = {
    getConfiguration: () => configuration,
    configure,
    getNetworkingEngine: () => ({
      registerRequestFilter: (filter: shaka.extern.RequestFilter) =>
        filters.push(filter),
      unregisterRequestFilter: () => undefined,
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  const shakaLib = {
    Player: { version: "4.7.0" },
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

  return { configuration, configure, deliver };
}

describe("shaka live window placement", () => {
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
