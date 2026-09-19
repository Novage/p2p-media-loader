import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequestExecutor } from "../src/http-loader.js";
import { Request as SegmentRequest } from "../src/requests/request.js";
import { BandwidthCalculator } from "../src/bandwidth-calculator.js";
import { EventTarget } from "../src/utils/event-target.js";
import { Core } from "../src/core.js";
import type { CoreEventMap, StreamConfig } from "../src/types.js";
import type {
  SegmentWithStream,
  StreamWithSegments,
} from "../src/internal-types.js";

const stream = {
  runtimeId: "https://cdn.example/v/720p/index.m3u8",
  type: "main",
  properties: { bitrate: 1_000_000 },
  swarmId: "https://cdn.example/v/master.m3u8",
  streamSwarmId: "v3-swarm-main-id",
  segments: new Map(),
} as unknown as StreamWithSegments;

const segment = {
  runtimeId: "seg-0",
  externalId: 0,
  url: "https://cdn.example/v/720p/0.ts",
  startTime: 0,
  endTime: 4,
  stream,
} as SegmentWithStream;

function execute(body: BodyInit | null, status = 200) {
  const eventTarget = new EventTarget<CoreEventMap>();
  const request = new SegmentRequest(
    segment,
    () => undefined,
    { all: new BandwidthCalculator(), http: new BandwidthCalculator() },
    eventTarget,
    "infohash",
  );
  const fetch = vi.fn(() => Promise.resolve(new Response(body, { status })));
  vi.stubGlobal("window", { ...globalThis, fetch });

  const executor = new HttpRequestExecutor(
    request,
    Core.DEFAULT_STREAM_CONFIG as StreamConfig,
    eventTarget,
  );
  executor.execute();
  return request;
}

/** Lets the fetch promise chain settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("HttpRequestExecutor on a response with no bytes", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fails the attempt instead of succeeding with an empty segment", async () => {
    const request = execute("");
    await settle();

    expect(request.status).toBe("failed");
    expect(request.loadedBytes).toBe(0);
    expect(request.failedAttempts.httpAttemptsCount).toBe(1);
    expect(request.failedAttempts.lastAttempt?.error.message).toBe(
      "HTTP response carried no bytes",
    );
  });

  it("succeeds when the response carries bytes", async () => {
    const request = execute(new Uint8Array([1, 2, 3, 4]));
    await settle();

    expect(request.status).toBe("succeed");
    expect(request.data.byteLength).toBe(4);
  });
});
