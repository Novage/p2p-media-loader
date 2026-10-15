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

describe("HttpRequestExecutor on bytes another source sent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Starts HTTP on a request that holds 16 bytes from `source`. */
  function resume(
    source: "http" | "p2p",
    validateP2PSegment?: StreamConfig["validateP2PSegment"],
  ) {
    vi.stubGlobal("window", globalThis);
    const eventTarget = new EventTarget<CoreEventMap>();
    const request = new SegmentRequest(
      segment,
      () => undefined,
      { all: new BandwidthCalculator(), http: new BandwidthCalculator() },
      eventTarget,
      "infohash",
    );
    request
      .start(
        source === "http"
          ? { downloadSource: "http" }
          : { downloadSource: "p2p", peerId: "-PM0400-peer" },
        { onAbort: () => undefined },
      )
      .addLoadedChunk(new Uint8Array(16));
    request.cancel();

    const ranges: (string | null)[] = [];
    const fetch = vi.fn((sent: globalThis.Request) => {
      ranges.push(sent.headers.get("Range"));
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal("window", { ...globalThis, fetch });
    new HttpRequestExecutor(
      request,
      { ...Core.DEFAULT_STREAM_CONFIG, validateP2PSegment } as StreamConfig,
      eventTarget,
      "high",
    ).execute();
    return { request, ranges };
  }
  const validate = () => Promise.resolve(true);

  it("goes on from a peer's bytes when peers' bytes are validated", async () => {
    // The download is still the peer's; it is validated as the peer's when
    // HTTP finishes it.
    const { request, ranges } = resume("p2p", validate);
    await settle();

    expect(request.loadedBytes).toBe(16);
    expect(ranges).toEqual(["bytes=16-"]);
  });

  it("goes on from its own bytes when peers' bytes are validated", async () => {
    const { ranges } = resume("http", validate);
    await settle();

    expect(ranges).toEqual(["bytes=16-"]);
  });

  it("goes on from a peer's bytes when nothing validates", async () => {
    const { ranges } = resume("p2p");
    await settle();

    expect(ranges).toEqual(["bytes=16-"]);
  });
});

describe("HttpRequestExecutor on a byte-range segment whose bytes were cleared", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const byteRange = { start: 1000, end: 1999 };

  /** Runs one HTTP attempt, answered by a correct 206, after `prepare`. */
  async function attempt(
    prepare: (request: SegmentRequest) => void,
    validateP2PSegment?: StreamConfig["validateP2PSegment"],
  ) {
    vi.stubGlobal("window", globalThis);
    const eventTarget = new EventTarget<CoreEventMap>();
    const request = new SegmentRequest(
      { ...segment, byteRange },
      () => undefined,
      { all: new BandwidthCalculator(), http: new BandwidthCalculator() },
      eventTarget,
      "infohash",
    );
    prepare(request);
    const fetch = vi.fn((sent: globalThis.Request) => {
      const start = Number(/bytes=(\d+)-/.exec(sent.headers.get("Range")!)![1]);
      return Promise.resolve(
        new Response(new Uint8Array(1999 - start + 1), {
          status: 206,
          headers: {
            "Content-Range": `bytes ${start}-1999/5000`,
            "Content-Length": String(1999 - start + 1),
          },
        }),
      );
    });
    vi.stubGlobal("window", { ...globalThis, fetch });
    new HttpRequestExecutor(
      request,
      { ...Core.DEFAULT_STREAM_CONFIG, validateP2PSegment } as StreamConfig,
      eventTarget,
      "high",
    ).execute();
    for (let i = 0; i < 5 && request.status === "loading"; i++) await settle();
    return request;
  }

  it("loads it again: the size comes from the byte range", async () => {
    // Without it, the Content-Range check fails, and so does every later
    // attempt of the same request.
    const request = await attempt((r) => r.clearLoadedBytes());

    expect(request.failedAttempts.lastAttempt?.error.type).toBeUndefined();
    expect(request.status).toBe("succeed");
  });

  it("loads the rest after a peer's bytes, and validates it as the peer's", async () => {
    const request = await attempt(
      (r) => {
        r.start(
          { downloadSource: "p2p", peerId: "-PM0400-peer" },
          { onAbort: () => undefined },
        ).addLoadedChunk(new Uint8Array(100));
        r.cancel();
      },
      () => Promise.resolve(true),
    );

    expect(request.failedAttempts.lastAttempt?.error.type).toBeUndefined();
    expect(request.status).toBe("succeed");
  });
});

describe("HttpRequestExecutor finishing a peer's download", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The segment is 1000 bytes at the origin. Bytes a peer sent are 1, bytes
  // HTTP sent are 2, so the joined data shows where each part came from.
  const PEER = "-PM0400-owner";
  const SIZE = 1000;

  async function finish(options: {
    /** Bytes held before HTTP starts, and who sent them. */
    held: { from: string; length: number; totalBytes?: number }[];
    validateP2PSegment?: StreamConfig["validateP2PSegment"];
    /** HTTP's answer, where the test needs another than a correct one. */
    respond?: () => Response;
  }) {
    vi.stubGlobal("window", globalThis);
    const eventTarget = new EventTarget<CoreEventMap>();
    const errors: Parameters<CoreEventMap["onSegmentError"]>[0][] = [];
    eventTarget.addEventListener("onSegmentError", (details) =>
      errors.push(details),
    );
    const request = new SegmentRequest(
      segment,
      () => undefined,
      { all: new BandwidthCalculator(), http: new BandwidthCalculator() },
      eventTarget,
      "infohash",
    );
    for (const { from, length, totalBytes } of options.held) {
      const controls = request.start(
        from === "http"
          ? { downloadSource: "http" }
          : { downloadSource: "p2p", peerId: from },
        { onAbort: () => undefined },
      );
      if (totalBytes !== undefined && request.totalBytes === undefined) {
        request.setTotalBytes(totalBytes);
      }
      if (length > 0) {
        controls.addLoadedChunk(
          new Uint8Array(length).fill(from === "http" ? 2 : 1),
        );
      }
      request.cancel();
    }

    const fetch = vi.fn((sent: globalThis.Request) => {
      if (options.respond) return Promise.resolve(options.respond());
      const range = sent.headers.get("Range");
      const start = range ? Number(/bytes=(\d+)-/.exec(range)![1]) : 0;
      return Promise.resolve(
        new Response(new Uint8Array(SIZE - start).fill(2), {
          status: range ? 206 : 200,
          headers: {
            ...(range
              ? { "Content-Range": `bytes ${start}-${SIZE - 1}/${SIZE}` }
              : {}),
            "Content-Length": String(SIZE - start),
          },
        }),
      );
    });
    vi.stubGlobal("window", { ...globalThis, fetch });
    const rejected: string[] = [];
    const causes: string[] = [];
    new HttpRequestExecutor(
      request,
      {
        ...Core.DEFAULT_STREAM_CONFIG,
        validateP2PSegment: options.validateP2PSegment,
      } as StreamConfig,
      eventTarget,
      "high",
      (peerId, cause) => {
        rejected.push(peerId);
        causes.push(cause);
      },
    ).execute();
    for (let i = 0; i < 5 && request.status === "loading"; i++) await settle();
    return { request, fetch, rejected, causes, errors };
  }

  it("joins the peer's bytes and HTTP's in order, and validates them as the peer's", async () => {
    const validate = vi.fn(() => Promise.resolve(true));
    const { request, rejected } = await finish({
      held: [{ from: PEER, length: 100 }],
      validateP2PSegment: validate,
    });

    expect(request.status).toBe("succeed");
    const data = new Uint8Array(request.data);
    expect(data.length).toBe(SIZE);
    expect(data.slice(0, 100).every((b) => b === 1)).toBe(true);
    expect(data.slice(100).every((b) => b === 2)).toBe(true);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(rejected).toEqual([]);
  });

  it("closes the peer, drops its bytes and spends no HTTP attempt when the segment fails", async () => {
    const { request, rejected, causes } = await finish({
      held: [{ from: PEER, length: 100 }],
      validateP2PSegment: () => Promise.resolve(false),
    });

    expect(request.status).toBe("failed");
    expect(request.failedAttempts.lastAttempt?.error.type).toBe(
      "p2p-segment-validation-failed",
    );
    expect(request.failedAttempts.httpAttemptsCount).toBe(0);
    expect(request.loadedBytes).toBe(0);
    expect(rejected).toEqual([PEER]);
    expect(causes).toEqual(["validation-failed"]);
  });

  it("validates a peer's complete bytes before it completes from them, with no request", async () => {
    // The peer sent every byte, and was stopped before its validation.
    const valid = await finish({
      held: [{ from: PEER, length: SIZE, totalBytes: SIZE }],
      validateP2PSegment: () => Promise.resolve(true),
    });
    expect(valid.fetch).not.toHaveBeenCalled();
    expect(valid.request.status).toBe("succeed");
    // Recorded as the peer's download, not HTTP's.
    expect(valid.request.downloadSource).toBe("p2p");

    const invalid = await finish({
      held: [{ from: PEER, length: SIZE, totalBytes: SIZE }],
      validateP2PSegment: () => Promise.resolve(false),
    });
    expect(invalid.fetch).not.toHaveBeenCalled();
    expect(invalid.request.status).toBe("failed");
    expect(invalid.request.failedAttempts.httpAttemptsCount).toBe(0);
    expect(invalid.rejected).toEqual([PEER]);
    expect(invalid.causes).toEqual(["validation-failed"]);
  });

  it.each([
    ["with", () => Promise.resolve(true)],
    ["without", undefined],
  ])(
    "blames the peer when HTTP has another size than the one it gave, %s a validator",
    async (_with, validateP2PSegment) => {
      // The peer said 500 bytes; the origin has 1000. HTTP is the truth.
      const { request, rejected, causes } = await finish({
        held: [{ from: PEER, length: 100, totalBytes: 500 }],
        validateP2PSegment,
      });

      expect(request.status).toBe("failed");
      expect(request.failedAttempts.lastAttempt?.error.type).toBe(
        "p2p-segment-size-mismatch",
      );
      expect(request.failedAttempts.httpAttemptsCount).toBe(0);
      expect(request.loadedBytes).toBe(0);
      expect(rejected).toEqual([PEER]);
      expect(causes).toEqual(["bytes-length-mismatch"]);
    },
  );

  it("blames the peer whose bytes go past the end HTTP has (416)", async () => {
    // The peer said 1500 bytes and sent 1200; the origin has 1000.
    const { request, rejected } = await finish({
      held: [{ from: PEER, length: 1200, totalBytes: 1500 }],
      respond: () => new Response(null, { status: 416 }),
    });

    expect(request.failedAttempts.lastAttempt?.error.type).toBe(
      "p2p-segment-size-mismatch",
    );
    expect(request.failedAttempts.httpAttemptsCount).toBe(0);
    expect(rejected).toEqual([PEER]);
  });

  it("blames the peer when HTTP sends more than the size it gave, with no size headers", async () => {
    const { request, rejected } = await finish({
      held: [{ from: PEER, length: 100, totalBytes: 500 }],
      respond: () => new Response(new Uint8Array(900), { status: 206 }),
    });

    expect(request.failedAttempts.lastAttempt?.error.type).toBe(
      "p2p-segment-size-mismatch",
    );
    expect(rejected).toEqual([PEER]);
  });

  it.each([
    ["larger", 1500],
    ["smaller", 500],
    ["equal", SIZE],
  ])(
    "takes HTTP's size on a 200 over a %s size a failed peer left, and judges no peer",
    async (_kind, peerSize) => {
      // The peer sent its size, then failed before any byte. HTTP's 200 is
      // the whole segment: its size replaces the peer's at once, and the
      // peer is judged only on bytes it sends.
      const { request, rejected } = await finish({
        held: [{ from: PEER, length: 0, totalBytes: peerSize as number }],
      });

      expect(request.status).toBe("succeed");
      expect(request.data.byteLength).toBe(SIZE);
      expect(request.failedAttempts.httpAttemptsCount).toBe(0);
      expect(rejected).toEqual([]);
    },
  );

  it("takes a peer's size as HTTP's once a 206 agrees with it", async () => {
    // From then on, a peer that gives another size is the one at fault.
    const { request } = await finish({
      held: [{ from: PEER, length: 100, totalBytes: SIZE }],
    });

    expect(request.status).toBe("succeed");
    expect(request.totalBytesFromPeer).toBeUndefined();
  });

  it("blames the peer when the Content-Range total contradicts its size", async () => {
    // The range's length matches what the peer's size expects; its total
    // does not. Without this check the request would end 200 bytes short.
    const { request, rejected, causes } = await finish({
      held: [{ from: PEER, length: 100, totalBytes: SIZE }],
      respond: () =>
        new Response(new Uint8Array(900), {
          status: 206,
          headers: {
            "Content-Range": "bytes 100-999/1200",
            "Content-Length": "900",
          },
        }),
    });

    expect(request.failedAttempts.lastAttempt?.error.type).toBe(
      "p2p-segment-size-mismatch",
    );
    expect(rejected).toEqual([PEER]);
    expect(causes).toEqual(["bytes-length-mismatch"]);
  });

  it("names the peer at fault in onSegmentError for an HTTP attempt", async () => {
    // The origin is not at fault: an integrator must not read it as such.
    const { errors } = await finish({
      held: [{ from: PEER, length: 100, totalBytes: 500 }],
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      downloadSource: "http",
      peerId: PEER,
    });
    expect(errors[0].error.type).toBe("p2p-segment-size-mismatch");
  });

  // With Content-Encoding, Content-Length is the compressed length; the body
  // fetch gives is decoded. 950 bytes travel, 1000 arrive.
  const compressed = (exposed: boolean) => () =>
    new Response(new Uint8Array(SIZE).fill(2), {
      status: 200,
      headers: {
        "Content-Length": "950",
        ...(exposed ? { "Content-Encoding": "gzip" } : {}),
      },
    });

  it("does not close a peer whose real size a compressed 200 shows, and goes on", async () => {
    const { request, rejected } = await finish({
      held: [{ from: PEER, length: 0, totalBytes: SIZE }],
      respond: compressed(true),
    });

    expect(request.status).toBe("succeed");
    expect(request.data.byteLength).toBe(SIZE);
    expect(rejected).toEqual([]);
  });

  it("does not take a compressed Content-Length as the size", async () => {
    const { request } = await finish({ held: [], respond: compressed(true) });

    expect(request.status).toBe("succeed");
    expect(request.data.byteLength).toBe(SIZE);
  });

  it("closes no peer when a cross-origin answer hides its Content-Encoding", async () => {
    // The browser shows Content-Length but not Content-Encoding: the
    // compressed length is taken as the size, and the body fails as a
    // truncation, as before (KNOWN-ISSUES.md). The peer is not blamed.
    const { request, rejected } = await finish({
      held: [{ from: PEER, length: 0, totalBytes: SIZE }],
      respond: compressed(false),
    });

    expect(request.failedAttempts.lastAttempt?.error.type).toBe(
      "http-bytes-mismatch",
    );
    expect(rejected).toEqual([]);
  });

  it("fails over HTTP, and blames no peer, when HTTP itself gave the size", async () => {
    // HTTP, then the peer, then HTTP: the size came from HTTP's first
    // answer, and the peer had to match it. The mismatch is HTTP's own.
    const { request, rejected, errors } = await finish({
      held: [
        { from: "http", length: 50, totalBytes: 500 },
        { from: PEER, length: 50 },
      ],
      validateP2PSegment: () => Promise.resolve(true),
    });

    expect(request.status).toBe("failed");
    expect(request.failedAttempts.lastAttempt?.error.type).toBe(
      "http-bytes-mismatch",
    );
    expect(request.failedAttempts.httpAttemptsCount).toBe(1);
    expect(rejected).toEqual([]);
    expect(errors[0]).toMatchObject({
      downloadSource: "http",
      peerId: undefined,
    });
  });

  it("learns the total from Content-Range, and finds a resumed body cut short", async () => {
    // The first answer had no Content-Length, so the total is unknown. The
    // resume's Content-Range gives it; the body then stops at 600 of 1000.
    const { request } = await finish({
      held: [{ from: "http", length: 100 }],
      respond: () =>
        new Response(new Uint8Array(500), {
          status: 206,
          headers: { "Content-Range": "bytes 100-999/1000" },
        }),
    });

    expect(request.status).toBe("failed");
    expect(request.failedAttempts.lastAttempt?.error.type).toBe(
      "http-bytes-mismatch",
    );
    // Kept, to go on from them with the next Range.
    expect(request.loadedBytes).toBe(600);
    expect(request.totalBytes).toBe(1000);
  });

  it("completes a peer's bytes followed by HTTP's as the peer's, validated", async () => {
    // The download is the peer's, however many HTTP bytes follow its own.
    const validate = vi.fn(() => Promise.resolve(true));
    const { request, fetch } = await finish({
      held: [
        { from: PEER, length: 100, totalBytes: SIZE },
        { from: "http", length: SIZE - 100 },
      ],
      validateP2PSegment: validate,
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(request.status).toBe("succeed");
    expect(request.downloadSource).toBe("p2p");
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it("completes HTTP's own complete bytes as HTTP's, with no validation", async () => {
    const validate = vi.fn(() => Promise.resolve(false));
    const { request, fetch } = await finish({
      held: [{ from: "http", length: SIZE, totalBytes: SIZE }],
      validateP2PSegment: validate,
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(request.status).toBe("succeed");
    expect(request.downloadSource).toBe("http");
    expect(validate).not.toHaveBeenCalled();
  });

  it("does not validate a download of HTTP bytes only", async () => {
    const validate = vi.fn(() => Promise.resolve(false));
    const { request } = await finish({
      held: [{ from: "http", length: 100 }],
      validateP2PSegment: validate,
    });

    expect(request.status).toBe("succeed");
    expect(validate).not.toHaveBeenCalled();
  });

  it("joins a peer's bytes with HTTP's and validates nothing when no validator is set", async () => {
    const { request } = await finish({ held: [{ from: PEER, length: 100 }] });

    expect(request.status).toBe("succeed");
    const data = new Uint8Array(request.data);
    expect(data.slice(0, 100).every((b) => b === 1)).toBe(true);
    expect(data.slice(100).every((b) => b === 2)).toBe(true);
  });
});
