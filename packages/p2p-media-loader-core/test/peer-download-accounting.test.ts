import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import debug from "debug";
import { diagnostics as compiledLedger } from "../src/diagnostics.js";
import { Peer } from "../src/p2p/peer.js";
import { Request as SegmentRequest } from "../src/requests/request.js";
import { BandwidthCalculator } from "../src/bandwidth-calculator.js";
import { EventTarget } from "../src/utils/event-target.js";
import { Core } from "../src/core.js";
import * as Command from "../src/p2p/commands/index.js";
import type { CoreEventMap } from "../src/types.js";
import type {
  SegmentWithStream,
  StreamWithSegments,
} from "../src/internal-types.js";

const MAX_MESSAGE_SIZE = 64 * 1024 - 1;

const stream = {
  runtimeId: "https://cdn.example/v/720p/index.m3u8",
  type: "main",
  properties: { bitrate: 1_000_000 },
  swarmId: "https://cdn.example/v/master.m3u8",
  streamSwarmId: "v3-swarm-main0",
  segments: new Map(),
} as unknown as StreamWithSegments;

const segment = {
  runtimeId: "seg-0",
  externalId: 7,
  url: "https://cdn.example/v/720p/7.ts",
  startTime: 0,
  endTime: 4,
  stream,
} as SegmentWithStream;

/**
 * Enough of an `RTCDataChannel` for the peer protocol: it records what the
 * peer sends and lets the test deliver commands back.
 */
function createChannel() {
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const sent: Uint8Array[] = [];
  return {
    binaryType: "arraybuffer",
    readyState: "open",
    bufferedAmount: 0,
    bufferedAmountLowThreshold: 0,
    send: (data: Uint8Array) => sent.push(data),
    close: () => undefined,
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      const existing = listeners.get(type) ?? [];
      existing.push(listener);
      listeners.set(type, existing);
    },
    removeEventListener: () => undefined,
    sent,
    /** Delivers raw segment bytes, as the data channel does. */
    deliverBytes(size: number) {
      for (const listener of listeners.get("message") ?? []) {
        listener({ data: new Uint8Array(size).fill(1).buffer });
      }
    },
    /** Delivers a command to the peer the way the data channel would. */
    deliver(command: Command.PeerCommand) {
      for (const chunk of Command.serializePeerCommand(
        command,
        MAX_MESSAGE_SIZE,
      )) {
        for (const listener of listeners.get("message") ?? []) {
          listener({ data: chunk.buffer.slice(0) });
        }
      }
    },
  };
}

function setup(validateP2PSegment?: (...args: unknown[]) => Promise<boolean>) {
  const eventTarget = new EventTarget<CoreEventMap>();
  const channel = createChannel();
  const closeConnection = vi.fn();
  const peer = new Peer(
    "-PM0400-peer",
    channel as unknown as RTCDataChannel,
    closeConnection,
    {
      onSegmentRequested: () => undefined,
      onSegmentsAnnouncement: () => undefined,
      onWarning: () => undefined,
    },
    {
      ...Core.DEFAULT_STREAM_CONFIG,
      validateP2PSegment,
      streamType: "main",
      infoHash: "infohash",
    },
    eventTarget,
  );
  const request = new SegmentRequest(
    segment,
    () => undefined,
    { all: new BandwidthCalculator(), http: new BandwidthCalculator() },
    eventTarget,
    "infohash",
  );
  const onSegmentError = vi.fn();
  const onChunkDownloaded = vi.fn();
  eventTarget.addEventListener("onSegmentError", onSegmentError);
  eventTarget.addEventListener("onChunkDownloaded", onChunkDownloaded);
  return {
    peer,
    channel,
    request,
    closeConnection,
    onSegmentError,
    onChunkDownloaded,
  };
}

/** The request id the peer put in the SegmentRequest command it just sent. */
function sentRequestId(channel: ReturnType<typeof createChannel>) {
  const joiner = new Command.BinaryCommandChunksJoiner((bytes) => {
    joined = Command.deserializeCommand(bytes);
  });
  let joined: Command.PeerCommand | undefined;
  for (const chunk of channel.sent) joiner.addCommandChunk(chunk);
  if (joined?.c !== Command.PeerCommandType.SegmentRequest) {
    throw new Error("no segment request was sent");
  }
  return joined.r;
}

// Absent only in a prebuilt bundle; the tests run on the source.
if (!compiledLedger) throw new Error("diagnostics are compiled out");
const diagnostics = compiledLedger;
debug.enable("p2pml:diagnostics");
diagnostics.snapshot();
debug.disable();

function counter(name: string) {
  return diagnostics.snapshot()?.counters[name] ?? 0;
}

/** Sends the whole segment as the remote peer would, then says it is done. */
function sendWholeSegment(
  channel: ReturnType<typeof createChannel>,
  size: number,
) {
  const r = sentRequestId(channel);
  channel.deliver({
    c: Command.PeerCommandType.SegmentData,
    i: segment.externalId,
    r,
    s: size,
  });
  channel.deliverBytes(size);
  channel.deliver({
    c: Command.PeerCommandType.SegmentDataSendingCompleted,
    i: segment.externalId,
    r,
  });
}

describe("a P2P segment that arrived whole", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "performance", "Date"],
    });
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("is not failed for want of bytes while a slow validator reads it", async () => {
    // Every byte is held when validation starts; nothing more can arrive. A
    // validator slower than p2pNotReceivingBytesTimeoutMs must not turn the
    // segment into a bytes-receiving-timeout.
    const validatorMs =
      Core.DEFAULT_STREAM_CONFIG.p2pNotReceivingBytesTimeoutMs + 1000;
    const { peer, channel, request, onSegmentError } = setup(
      () =>
        new Promise((resolve) => setTimeout(() => resolve(true), validatorMs)),
    );
    peer.downloadSegment(request);
    sendWholeSegment(channel, 1000);

    await vi.advanceTimersByTimeAsync(validatorMs + 500);

    expect(onSegmentError).not.toHaveBeenCalled();
    expect(request.status).toBe("succeed");
  });
});

describe("bytes a peer sends with no download to go to", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("are dropped, and not reported as downloaded", () => {
    // The tail of a transfer this side already cancelled arrives before the
    // next request's SegmentData: the peer drops it, so onChunkDownloaded —
    // what an integrator sums as P2P traffic — must not count it.
    const { peer, channel, request, onChunkDownloaded } = setup();
    const dropped = counter("PeerChunk:dropped");
    peer.downloadSegment(request);

    channel.deliverBytes(5000);

    expect(request.loadedBytes).toBe(0);
    expect(onChunkDownloaded).not.toHaveBeenCalled();
    expect(counter("PeerChunk:dropped")).toBe(dropped + 1);
  });

  it("are reported once they belong to the download", () => {
    const { peer, channel, request, onChunkDownloaded } = setup();
    peer.downloadSegment(request);
    channel.deliver({
      c: Command.PeerCommandType.SegmentData,
      i: segment.externalId,
      r: sentRequestId(channel),
      s: 1000,
    });

    channel.deliverBytes(1000);

    expect(request.loadedBytes).toBe(1000);
    expect(onChunkDownloaded).toHaveBeenCalledTimes(1);
    expect(onChunkDownloaded.mock.calls[0][0]).toBe(1000);
  });
});
