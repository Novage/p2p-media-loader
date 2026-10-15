import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Peer } from "../src/p2p/peer.js";
import { Request as SegmentRequest } from "../src/requests/request.js";
import { BandwidthCalculator } from "../src/bandwidth-calculator.js";
import { EventTarget } from "../src/utils/event-target.js";
import { Core } from "../src/core.js";
import * as Command from "../src/p2p/commands/index.js";
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
  externalId: 7,
  url: "https://cdn.example/v/720p/7.ts",
  startTime: 0,
  endTime: 4,
  stream,
} as SegmentWithStream;

/** A data channel whose `send` fails while `closing` is set. */
function setup(config: Partial<StreamConfig> = {}) {
  const channel = {
    binaryType: "arraybuffer",
    readyState: "open",
    bufferedAmount: 0,
    bufferedAmountLowThreshold: 0,
    closing: false,
    send() {
      if (channel.closing) throw new Error("channel is closing");
    },
    close: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  const eventTarget = new EventTarget<CoreEventMap>();
  const peer = new Peer(
    "-PM0400-peer",
    channel as unknown as RTCDataChannel,
    vi.fn(),
    {
      onSegmentRequested: () => undefined,
      onSegmentsAnnouncement: () => undefined,
      onWarning: () => undefined,
    },
    {
      ...Core.DEFAULT_STREAM_CONFIG,
      ...config,
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
  return { peer, channel, request };
}

describe("Peer.downloadSegment", () => {
  beforeEach(() => {
    // The request's not-receiving-bytes timeout is scheduled on `window`.
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the tag of an attempt that fails at once", () => {
    // The channel is closing: the request command cannot go out, and the
    // attempt fails before downloadSegment returns. The tag is set as the
    // attempt starts, so the failed attempt still has it.
    const { peer, channel, request } = setup();
    channel.closing = true;

    expect(peer.downloadSegment(request, "peer-after-http-failure")).toBe(true);
    expect(request.status).toBe("failed");
    expect(request.failedAttempts.hasTag("peer-after-http-failure")).toBe(true);
  });

  it("starts no attempt when the peer is destroyed", () => {
    const { peer, request } = setup();
    peer.destroy();

    expect(peer.downloadSegment(request)).toBe(false);
    expect(request.status).toBe("not-started");
  });
});

describe("Peer.downloadSegment on bytes another source sent", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A download of 16 bytes from `peerId`, or HTTP, stopped and kept. */
  function keepBytesFrom(request: SegmentRequest, peerId: string | "http") {
    request
      .start(
        peerId === "http"
          ? { downloadSource: "http" }
          : { downloadSource: "p2p", peerId },
        { onAbort: () => undefined },
      )
      .addLoadedChunk(new Uint8Array(16));
    request.cancel();
  }
  const validateP2PSegment = () => Promise.resolve(true);

  it("starts from byte 0 when it validates the segment", () => {
    // It would validate bytes it did not send, and take the blame for them.
    const { peer, request } = setup({ validateP2PSegment });
    keepBytesFrom(request, "-PM0400-other");

    peer.downloadSegment(request);

    expect(request.loadedBytes).toBe(0);
  });

  it("goes on from its own bytes when it validates the segment", () => {
    const { peer, request } = setup({ validateP2PSegment });
    keepBytesFrom(request, "-PM0400-peer");

    peer.downloadSegment(request);

    expect(request.loadedBytes).toBe(16);
  });

  it("goes on from HTTP's bytes when it validates the segment", () => {
    // HTTP is trusted: its bytes cannot be the cause of a failed validation.
    const { peer, request } = setup({ validateP2PSegment });
    keepBytesFrom(request, "http");
    keepBytesFrom(request, "-PM0400-peer");

    peer.downloadSegment(request);

    expect(request.loadedBytes).toBe(32);
  });

  it("starts from byte 0 on HTTP's bytes mixed with another peer's", () => {
    const { peer, request } = setup({ validateP2PSegment });
    keepBytesFrom(request, "http");
    keepBytesFrom(request, "-PM0400-other");

    peer.downloadSegment(request);

    expect(request.loadedBytes).toBe(0);
  });

  it("starts from byte 0 on bytes that only partly came from it", () => {
    const { peer, request } = setup({ validateP2PSegment });
    keepBytesFrom(request, "-PM0400-other");
    keepBytesFrom(request, "-PM0400-peer");

    peer.downloadSegment(request);

    expect(request.loadedBytes).toBe(0);
  });

  it("goes on from another source's bytes when nothing validates", () => {
    const { peer, request } = setup();
    keepBytesFrom(request, "-PM0400-other");

    peer.downloadSegment(request);

    expect(request.loadedBytes).toBe(16);
  });
});

describe("Peer.downloadSegment going on from bytes another source sent", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A data channel the test sends through as the other peer. */
  function connect(validateP2PSegment: StreamConfig["validateP2PSegment"]) {
    const listeners: ((event: { data: ArrayBuffer }) => void)[] = [];
    const sent: Uint8Array[] = [];
    const channel = {
      binaryType: "arraybuffer",
      readyState: "open",
      bufferedAmount: 0,
      bufferedAmountLowThreshold: 0,
      send: (data: Uint8Array) => sent.push(data),
      close: () => undefined,
      addEventListener: (
        type: string,
        listener: (event: { data: ArrayBuffer }) => void,
      ) => {
        if (type === "message") listeners.push(listener);
      },
      removeEventListener: () => undefined,
    };
    const deliver = (data: Uint8Array) => {
      for (const listener of listeners) listener({ data: data.slice().buffer });
    };
    const eventTarget = new EventTarget<CoreEventMap>();
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
    /** Every command the peer sent, in order. */
    const sentCommands = () => {
      // A joiner joins one command: a new one for each.
      const commands: Command.PeerCommand[] = [];
      const newJoiner = () =>
        new Command.BinaryCommandChunksJoiner((bytes) => {
          commands.push(Command.deserializeCommand(bytes));
          joiner = newJoiner();
        });
      let joiner = newJoiner();
      for (const chunk of sent) joiner.addCommandChunk(chunk);
      return commands;
    };
    /** The SegmentRequest command the peer sent. */
    const segmentRequest = () => {
      const asked = sentCommands().find(
        (c) => c.c === Command.PeerCommandType.SegmentRequest,
      );
      if (asked?.c !== Command.PeerCommandType.SegmentRequest) {
        throw new Error("no segment request was sent");
      }
      return asked;
    };
    const command = (c: Command.PeerCommand) => {
      for (const chunk of Command.serializePeerCommand(c, 64 * 1024 - 1)) {
        deliver(chunk);
      }
    };
    return {
      peer,
      request,
      segmentRequest,
      sentCommands,
      command,
      deliver,
      closeConnection,
    };
  }

  /** A stopped download of `length` bytes, each `fill`, from `from`. */
  function hold(
    request: SegmentRequest,
    from: string,
    length: number,
    totalBytes: number,
    fill: number,
  ) {
    const controls = request.start(
      from === "http"
        ? { downloadSource: "http" }
        : { downloadSource: "p2p", peerId: from },
      { onAbort: () => undefined },
    );
    request.setTotalBytes(totalBytes);
    controls.addLoadedChunk(new Uint8Array(length).fill(fill));
    request.cancel();
  }
  const settled = async (request: SegmentRequest) => {
    for (let k = 0; k < 5 && request.status === "loading"; k++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };

  it("completes HTTP's complete bytes as HTTP's, with no validation and no request", async () => {
    const validate = vi.fn(() => Promise.resolve(false));
    const { peer, request, sentCommands } = connect(validate);
    hold(request, "http", 1000, 1000, 2);

    expect(peer.downloadSegment(request)).toBe(true);
    await settled(request);

    expect(request.status).toBe("succeed");
    expect(request.downloadSource).toBe("http");
    expect(validate).not.toHaveBeenCalled();
    expect(sentCommands()).toEqual([]);
  });

  it("closes itself when its own complete bytes fail validation", async () => {
    // It sent every byte before, and was stopped before its validation.
    const { peer, request, closeConnection } = connect(() =>
      Promise.resolve(false),
    );
    hold(request, "-PM0400-peer", 1000, 1000, 1);

    peer.downloadSegment(request);
    await settled(request);

    expect(request.status).toBe("failed");
    expect(request.downloadSource).toBe("p2p");
    expect(request.failedAttempts.lastAttempt?.error.type).toBe(
      "p2p-segment-validation-failed",
    );
    expect(closeConnection).toHaveBeenCalledTimes(1);
  });

  it("goes on from another peer's bytes when nothing validates", async () => {
    const { peer, request, segmentRequest, command, deliver, closeConnection } =
      connect(undefined);
    hold(request, "-PM0400-other", 100, 1000, 1);

    peer.downloadSegment(request);
    const { i, r, b } = segmentRequest();
    expect(b).toBe(100);
    command({ c: Command.PeerCommandType.SegmentData, i, r, s: 900 });
    deliver(new Uint8Array(900).fill(3));
    command({ c: Command.PeerCommandType.SegmentDataSendingCompleted, i, r });
    await settled(request);

    expect(request.status).toBe("succeed");
    const data = new Uint8Array(request.data);
    expect(data.slice(0, 100).every((x) => x === 1)).toBe(true);
    expect(data.slice(100).every((x) => x === 3)).toBe(true);
    expect(closeConnection).not.toHaveBeenCalled();
  });

  it("closes no one when its size conflicts with another peer's, and starts over", async () => {
    // The other peer said 1000 bytes; this one says 500. Nothing tells
    // which is right.
    const {
      peer,
      request,
      segmentRequest,
      sentCommands,
      command,
      closeConnection,
    } = connect(undefined);
    hold(request, "-PM0400-other", 100, 1000, 1);

    peer.downloadSegment(request);
    const { i, r } = segmentRequest();
    command({ c: Command.PeerCommandType.SegmentData, i, r, s: 400 });

    expect(request.status).toBe("failed");
    expect(request.failedAttempts.lastAttempt?.error.type).toBe(
      "p2p-segment-size-conflict",
    );
    expect(request.loadedBytes).toBe(0);
    expect(request.totalBytes).toBeUndefined();
    expect(closeConnection).not.toHaveBeenCalled();
    expect(
      sentCommands().some(
        (c) => c.c === Command.PeerCommandType.CancelSegmentRequest,
      ),
    ).toBe(true);
  });

  it("closes the peer whose size contradicts HTTP's", () => {
    // HTTP gave the size: it is the truth.
    const { peer, request, segmentRequest, command, closeConnection } =
      connect(undefined);
    hold(request, "http", 100, 1000, 2);

    peer.downloadSegment(request);
    const { i, r } = segmentRequest();
    command({ c: Command.PeerCommandType.SegmentData, i, r, s: 400 });

    expect(closeConnection).toHaveBeenCalledTimes(1);
    expect(request.status).toBe("failed");
    // HTTP's bytes are not this peer's: they stay.
    expect(request.loadedBytes).toBe(100);
  });

  it("closes a peer whose size contradicts one HTTP confirmed, and keeps the bytes", () => {
    // Peer X gave the size and sent 300 bytes; HTTP agreed with the size
    // and sent 300 more. A peer with another size is wrong: it is not a
    // conflict between two peers.
    const { peer, request, segmentRequest, command, closeConnection } =
      connect(undefined);
    hold(request, "-PM0400-other", 300, 1000, 1);
    const http = request.start(
      { downloadSource: "http" },
      { onAbort: () => undefined },
    );
    request.confirmTotalBytes();
    http.addLoadedChunk(new Uint8Array(300).fill(2));
    request.cancel();

    peer.downloadSegment(request);
    const { i, r } = segmentRequest();
    command({ c: Command.PeerCommandType.SegmentData, i, r, s: 999 });

    expect(closeConnection).toHaveBeenCalledTimes(1);
    expect(request.failedAttempts.lastAttempt?.error.type).not.toBe(
      "p2p-segment-size-conflict",
    );
    expect(request.loadedBytes).toBe(600);
    expect(request.totalBytes).toBe(1000);
  });

  it("asks for the rest, joins it after HTTP's bytes, and validates it as its own", async () => {
    const validate = vi.fn(() => Promise.resolve(true));
    const { peer, request, segmentRequest, command, deliver } =
      connect(validate);
    // HTTP sent the first 100 of 1000 bytes, then stopped.
    const http = request.start(
      { downloadSource: "http" },
      { onAbort: () => undefined },
    );
    request.setTotalBytes(1000);
    http.addLoadedChunk(new Uint8Array(100).fill(2));
    request.cancel();

    peer.downloadSegment(request);
    const asked = segmentRequest();
    expect(asked.b).toBe(100);

    const { i, r } = asked;
    command({ c: Command.PeerCommandType.SegmentData, i, r, s: 900 });
    deliver(new Uint8Array(900).fill(1));
    command({ c: Command.PeerCommandType.SegmentDataSendingCompleted, i, r });
    for (let k = 0; k < 5 && request.status === "loading"; k++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(request.status).toBe("succeed");
    const data = new Uint8Array(request.data);
    expect(data.length).toBe(1000);
    expect(data.slice(0, 100).every((b) => b === 2)).toBe(true);
    expect(data.slice(100).every((b) => b === 1)).toBe(true);
    expect(validate).toHaveBeenCalledTimes(1);
  });
});
