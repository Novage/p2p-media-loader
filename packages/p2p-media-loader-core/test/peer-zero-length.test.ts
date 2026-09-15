import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Peer } from "../src/p2p/peer.js";
import { Request as SegmentRequest } from "../src/requests/request.js";
import { BandwidthCalculator } from "../src/bandwidth-calculator.js";
import { EventTarget } from "../src/utils/event-target.js";
import { Core } from "../src/core.js";
import * as Command from "../src/p2p/commands/index.js";
import type { CoreEventMap } from "../src/types.js";
import type {
  Playback,
  SegmentWithStream,
  StreamWithSegments,
} from "../src/internal-types.js";

const MAX_MESSAGE_SIZE = 64 * 1024 - 1;

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

function setup() {
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
      streamType: "main",
      infoHash: "infohash",
    },
    eventTarget,
  );
  const request = new SegmentRequest(
    segment,
    () => undefined,
    { all: new BandwidthCalculator(), http: new BandwidthCalculator() },
    { bufferEdge: 0, bufferAhead: 0, rate: 1, source: "reported" } as Playback,
    Core.DEFAULT_STREAM_CONFIG,
    eventTarget,
    "infohash",
  );
  return { peer, channel, request, closeConnection };
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

describe("a peer that answers with a zero-length segment", () => {
  beforeEach(() => {
    // The request's not-receiving-bytes timeout is scheduled on `window`.
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is treated as a protocol error, not as a delivered segment", () => {
    const { peer, channel, request, closeConnection } = setup();
    peer.downloadSegment(request);

    channel.deliver({
      c: Command.PeerCommandType.SegmentData,
      i: segment.externalId,
      r: sentRequestId(channel),
      s: 0,
    });

    expect(closeConnection).toHaveBeenCalledTimes(1);
    const [error] = closeConnection.mock.calls[0] as [
      { type: string; message: string },
    ];
    expect(error.type).toBe("bytes-length-mismatch");
    expect(request.status).not.toBe("succeed");
  });
});
