import { describe, expect, it, vi } from "vitest";
import { Peer } from "../src/p2p/peer.js";
import { EventTarget } from "../src/utils/event-target.js";
import { Core } from "../src/core.js";
import * as Command from "../src/p2p/commands/index.js";
import type { CoreEventMap } from "../src/types.js";

const MAX_MESSAGE_SIZE = 64 * 1024 - 1;

/**
 * A data channel as an engine that predates the WebRTC default hands it
 * over: delivering binary messages as `Blob`s unless told otherwise.
 */
function blobChannel() {
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const channel = {
    binaryType: "blob" as BinaryType,
    readyState: "open",
    bufferedAmount: 0,
    bufferedAmountLowThreshold: 0,
    send: () => undefined,
    close: () => undefined,
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener: () => undefined,
    /** Delivers a command the way the channel would, in its current type. */
    deliver(command: Command.PeerCommand) {
      for (const chunk of Command.serializePeerCommand(
        command,
        MAX_MESSAGE_SIZE,
      )) {
        const bytes = chunk.buffer.slice(0);
        const data =
          channel.binaryType === "arraybuffer" ? bytes : new Blob([bytes]);
        for (const listener of listeners.get("message") ?? []) {
          listener({ data });
        }
      }
    },
  };
  return channel;
}

describe("a peer on a channel that arrives delivering Blobs", () => {
  it("sets the channel to deliver ArrayBuffers and reads what arrives", () => {
    const channel = blobChannel();
    const onSegmentsAnnouncement = vi.fn();

    const peer = new Peer(
      "-PM0500-remote",
      channel as unknown as RTCDataChannel,
      () => undefined,
      {
        onSegmentRequested: () => undefined,
        onSegmentsAnnouncement,
        onWarning: () => undefined,
      },
      { ...Core.DEFAULT_STREAM_CONFIG, streamType: "main", infoHash: "info" },
      new EventTarget<CoreEventMap>(),
    );
    expect(channel.binaryType).toBe("arraybuffer");

    // Usable, not merely built: an announcement on the channel is read.
    channel.deliver({
      c: Command.PeerCommandType.SegmentsAnnouncement,
      l: [7, 8],
      p: [],
    });
    expect(onSegmentsAnnouncement).toHaveBeenCalledTimes(1);
    peer.destroy(true);
  });
});
