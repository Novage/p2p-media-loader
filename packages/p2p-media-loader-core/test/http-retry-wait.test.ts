import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Request as SegmentRequest } from "../src/requests/request.js";
import { BandwidthCalculator } from "../src/bandwidth-calculator.js";
import { EventTarget } from "../src/utils/event-target.js";
import { RequestError, type CoreEventMap } from "../src/types.js";
import type {
  SegmentWithStream,
  StreamWithSegments,
} from "../src/internal-types.js";

const stream = {
  runtimeId: "https://cdn.example/v/720p/index.m3u8",
  type: "main",
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

describe("Request: when the next HTTP attempt may start", () => {
  let clock = 0;
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
    clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function newRequest() {
    return new SegmentRequest(
      segment,
      () => undefined,
      { all: new BandwidthCalculator(), http: new BandwidthCalculator() },
      new EventTarget<CoreEventMap>(),
      "infohash",
    );
  }
  /** An attempt from `source` that fails at the clock's time. */
  function fail(
    request: SegmentRequest,
    source: "http" | "p2p",
    type: ConstructorParameters<typeof RequestError>[0] = "http-error",
  ) {
    request
      .start(
        source === "http"
          ? { downloadSource: "http" }
          : { downloadSource: "p2p", peerId: "peer-0" },
        { onAbort: () => undefined },
      )
      .failWithError(new RequestError(type));
  }

  it("may start at once before any HTTP failure", () => {
    expect(newRequest().failedAttempts.httpRetryAt).toBeUndefined();
  });

  it("waits 1 s after the first HTTP failure, and twice as long after each next one", () => {
    const request = newRequest();
    clock = 100;
    fail(request, "http");
    expect(request.failedAttempts.httpRetryAt).toBe(1100);

    clock = 1200;
    fail(request, "http");
    expect(request.failedAttempts.httpRetryAt).toBe(3200);

    clock = 3300;
    fail(request, "http");
    expect(request.failedAttempts.httpRetryAt).toBe(7300);
  });

  it("waits at most 30 s, below the 60 s after which the failures are cleared", () => {
    // Otherwise, from the 7th failure on, the wait would outlast the failed
    // attempts, and a request would never reach httpErrorRetries.
    const request = newRequest();
    for (let failure = 1; failure <= 6; failure++) {
      clock = failure * 100_000;
      fail(request, "http");
    }
    expect(request.failedAttempts.httpRetryAt).toBe(600_000 + 30_000);
    clock = 700_000;
    fail(request, "http");
    expect(request.failedAttempts.httpRetryAt).toBe(700_000 + 30_000);
  });

  it("clears the failed attempts only after 60 s with no new failure", () => {
    const request = newRequest();
    clock = 1000;
    fail(request, "http");
    clock = 2000;
    fail(request, "p2p", "peer-closed");

    // Measured from the last attempt of any kind.
    expect(request.failedAttempts.clearIfStale(62_000)).toBe(false);
    expect(request.failedAttempts.httpAttemptsCount).toBe(1);
    expect(request.failedAttempts.clearIfStale(62_001)).toBe(true);
    expect(request.failedAttempts.httpAttemptsCount).toBe(0);
    expect(request.failedAttempts.httpRetryAt).toBeUndefined();
  });

  it("does not wait for a failure that was not the origin's", () => {
    // A peer's failure, and an HTTP attempt that failed on a peer's bytes,
    // say nothing of the origin: its next attempt goes at once.
    const request = newRequest();
    fail(request, "p2p", "peer-closed");
    fail(request, "http", "p2p-segment-validation-failed");
    expect(request.failedAttempts.httpRetryAt).toBeUndefined();

    clock = 500;
    fail(request, "http");
    fail(request, "p2p", "peer-closed");
    expect(request.failedAttempts.httpRetryAt).toBe(1500);
  });
});
