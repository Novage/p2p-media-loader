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
  return executeWith(() => Promise.resolve(new Response(body, { status })));
}

function executeWith(
  respond: (request: globalThis.Request) => Promise<Response>,
  byteRange?: { start: number; end: number },
  priority: RequestPriority = "low",
) {
  const eventTarget = new EventTarget<CoreEventMap>();
  const request = new SegmentRequest(
    byteRange ? { ...segment, byteRange } : segment,
    () => undefined,
    { all: new BandwidthCalculator(), http: new BandwidthCalculator() },
    eventTarget,
    "infohash",
  );
  const fetch = vi.fn(respond);
  vi.stubGlobal("window", { ...globalThis, fetch });

  const executor = new HttpRequestExecutor(
    request,
    Core.DEFAULT_STREAM_CONFIG as StreamConfig,
    eventTarget,
    priority,
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

/** A fetch that answers only when told to, and rejects when aborted. */
function heldFetch() {
  let answer: ((response: Response) => void) | undefined;
  const respond = (request: globalThis.Request) =>
    new Promise<Response>((resolve, reject) => {
      answer = resolve;
      request.signal.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")),
      );
    });
  return { respond, answer: (response: Response) => answer?.(response) };
}

describe("HttpRequestExecutor timeouts", () => {
  const { httpFirstByteTimeoutMs, httpNotReceivingBytesTimeoutMs } =
    Core.DEFAULT_STREAM_CONFIG;

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits for the headers longer than for a stalled body", async () => {
    // A slow network, a new connection or a CDN filling its cache can take
    // longer than the stall timeout to answer.
    const held = heldFetch();
    const request = executeWith(held.respond);

    await vi.advanceTimersByTimeAsync(httpNotReceivingBytesTimeoutMs + 2000);
    expect(request.status).toBe("loading");

    held.answer(new Response(new Uint8Array([1, 2, 3, 4])));
    await vi.advanceTimersByTimeAsync(0);
    expect(request.status).toBe("succeed");
  });

  it("fails an attempt whose headers never come", async () => {
    const held = heldFetch();
    const request = executeWith(held.respond);

    await vi.advanceTimersByTimeAsync(httpFirstByteTimeoutMs - 1);
    expect(request.status).toBe("loading");
    await vi.advanceTimersByTimeAsync(2);
    expect(request.status).toBe("failed");
    expect(request.failedAttempts.lastAttempt?.error.type).toBe(
      "bytes-receiving-timeout",
    );
  });

  it("fails a body that stalls after its headers, counted from the headers", async () => {
    const held = heldFetch();
    const request = executeWith(held.respond);
    await vi.advanceTimersByTimeAsync(5000);

    // Headers, and a body that never sends a byte.
    held.answer(new Response(new ReadableStream<Uint8Array>()));
    await vi.advanceTimersByTimeAsync(httpNotReceivingBytesTimeoutMs - 1);
    expect(request.status).toBe("loading");
    await vi.advanceTimersByTimeAsync(2);
    expect(request.status).toBe("failed");
    expect(request.failedAttempts.lastAttempt?.error.type).toBe(
      "bytes-receiving-timeout",
    );
  });
});

describe("HttpRequestExecutor on a response refused on its headers", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A body that records whether it was cancelled, and never ends by itself. */
  function watchedBody() {
    const body = { cancelled: false };
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4]));
      },
      cancel() {
        body.cancelled = true;
      },
    });
    return { body, stream };
  }

  it("cancels the body of an error status", async () => {
    const { body, stream } = watchedBody();
    const request = execute(stream, 503);
    await settle();

    expect(request.status).toBe("failed");
    expect(request.failedAttempts.lastAttempt?.error.type).toBe("http-error");
    expect(body.cancelled).toBe(true);
  });

  it("cancels the whole file sent for a byte range", async () => {
    // A server that ignores the range answers 200 with the whole file: the
    // body can be far larger than the segment, and nobody reads it.
    const { body, stream } = watchedBody();
    const request = executeWith(
      () => Promise.resolve(new Response(stream, { status: 200 })),
      { start: 0, end: 3 },
    );
    await settle();

    expect(request.status).toBe("failed");
    expect(request.failedAttempts.lastAttempt?.error.type).toBe(
      "http-unexpected-status-code",
    );
    expect(body.cancelled).toBe(true);
  });
});

describe("HttpRequestExecutor fetch priority", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds its request with the priority it was given", async () => {
    // The browser serves a "high" request before "low" prefetch where it can;
    // one without fetch priorities ignores the option.
    const inits: RequestInit[] = [];
    const NativeRequest = globalThis.Request;
    vi.stubGlobal(
      "Request",
      class extends NativeRequest {
        constructor(input: RequestInfo | URL, init?: RequestInit) {
          if (init) inits.push(init);
          super(input, init);
        }
      },
    );
    executeWith(
      () => Promise.resolve(new Response(new Uint8Array([1]))),
      undefined,
      "high",
    );
    await settle();

    expect(inits.map((init) => init.priority)).toEqual(["high"]);
  });
});
