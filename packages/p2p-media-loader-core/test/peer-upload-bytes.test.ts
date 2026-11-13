import { describe, expect, it, vi } from "vitest";
import { Peer } from "../src/p2p/peer.js";
import { EventTarget } from "../src/utils/event-target.js";
import { Core } from "../src/core.js";
import * as Command from "../src/p2p/commands/index.js";
import type { CoreEventMap } from "../src/types.js";
import type { SegmentWithStream } from "../src/internal-types.js";

const MAX_MESSAGE_SIZE = 64 * 1024 - 1;

const segment = {
  runtimeId: "seg-0",
  externalId: 7,
  url: "https://cdn.example/v/720p/7.ts",
  startTime: 0,
  endTime: 4,
  stream: { type: "main" },
} as unknown as SegmentWithStream;

/** An open data channel that takes everything sent, and delivers commands. */
function setup() {
  const listeners: ((event: unknown) => void)[] = [];
  const channel = {
    binaryType: "arraybuffer",
    readyState: "open",
    bufferedAmount: 0,
    bufferedAmountLowThreshold: 0,
    send: () => undefined,
    close: () => undefined,
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      if (type === "message") listeners.push(listener);
    },
    removeEventListener: () => undefined,
  };
  const peer = new Peer(
    "-PM0500-peer",
    channel as unknown as RTCDataChannel,
    vi.fn(),
    {
      onSegmentRequested: () => undefined,
      onSegmentsAnnouncement: () => undefined,
      onWarning: () => undefined,
    },
    { ...Core.DEFAULT_STREAM_CONFIG, streamType: "main", infoHash: "infohash" },
    new EventTarget<CoreEventMap>(),
  );
  const request = (requestId: number) => {
    const command: Command.PeerCommand = {
      c: Command.PeerCommandType.SegmentRequest,
      i: segment.externalId,
      r: requestId,
    };
    for (const chunk of Command.serializePeerCommand(
      command,
      MAX_MESSAGE_SIZE,
    )) {
      for (const listener of listeners) {
        listener({ data: chunk.buffer.slice(0) });
      }
    }
  };
  return { peer, request };
}

describe("a peer's upload, as counted for the trackers", () => {
  it("counts the bytes of an upload that completes", async () => {
    const { peer, request } = setup();
    request(1);
    await expect(
      peer.uploadSegmentData(segment, 1, new Uint8Array(200_000)),
    ).resolves.toBe(200_000);
  });

  it("counts nothing for an upload a newer request made obsolete", async () => {
    const { peer, request } = setup();
    request(1);
    request(2);
    await expect(
      peer.uploadSegmentData(segment, 1, new Uint8Array(200_000)),
    ).resolves.toBe(0);
  });
});
