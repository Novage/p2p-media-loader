import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import debug from "debug";
import { P2PLoader } from "../src/p2p/loader.js";
import { RequestsContainer } from "../src/requests/request-container.js";
import { WebTorrentSocketPool } from "../src/webtorrent/webtorrent-socket-pool/index.js";
import { BandwidthCalculator } from "../src/bandwidth-calculator.js";
import { EventTarget } from "../src/utils/event-target.js";
import { Core } from "../src/core.js";
import * as Command from "../src/p2p/commands/index.js";
import { diagnostics as compiledLedger } from "../src/diagnostics.js";
import type {
  CoreEventMap,
  SegmentStorage,
  StreamConfig,
} from "../src/types.js";
import type {
  SegmentWithStream,
  StreamWithSegments,
} from "../src/internal-types.js";

/** The manager of the loader under test: it connects the peers the test hands it. */
const manager = vi.hoisted(() => ({
  peerConnected: undefined as ((event: unknown) => void) | undefined,
}));

vi.mock("../src/webtorrent/webtorrent-manager/index.js", () => ({
  WebTorrentManager: class {
    addEventListener(name: string, listener: (event: unknown) => void) {
      if (name === "peerConnected") manager.peerConnected = listener;
    }
    start() {}
    destroy() {}
  },
}));

// Absent only in a prebuilt bundle; the tests run on the source.
if (!compiledLedger) throw new Error("diagnostics are compiled out");
const diagnostics = compiledLedger;
debug.enable("p2pml:diagnostics");
diagnostics.snapshot();
debug.disable();

const MAX_MESSAGE_SIZE = 64 * 1024 - 1;

function counter(name: string) {
  return diagnostics.snapshot()?.counters[name] ?? 0;
}

/** A data channel that records what the loader's peer sends back. */
function createChannel() {
  const listeners: ((event: unknown) => void)[] = [];
  const sent: Command.PeerCommand[] = [];
  // A command this small is one chunk; segment bytes are not commands.
  const onSent = (data: Uint8Array) => {
    if (!Command.isCommandChunk(data)) return;
    new Command.BinaryCommandChunksJoiner((bytes) => {
      sent.push(Command.deserializeCommand(bytes));
    }).addCommandChunk(data);
  };
  return {
    binaryType: "arraybuffer",
    readyState: "open",
    bufferedAmount: 0,
    bufferedAmountLowThreshold: 0,
    send: onSent,
    close: () => undefined,
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      if (type === "message") listeners.push(listener);
    },
    removeEventListener: () => undefined,
    sent,
    deliver(command: Command.PeerCommand) {
      for (const chunk of Command.serializePeerCommand(
        command,
        MAX_MESSAGE_SIZE,
      )) {
        for (const listener of listeners) {
          listener({ data: chunk.buffer.slice(0) });
        }
      }
    },
  };
}

function setup(segments: SegmentWithStream[]) {
  const stream = {
    runtimeId: "https://cdn.example/live/index.m3u8",
    type: "main",
    properties: { bitrate: 1_000_000 },
    swarmId: "swarm",
    streamSwarmId: "swarm-main0",
    infoHash: "info-main0",
    streamId: "main0",
    segments: new Map(),
  } as unknown as StreamWithSegments;
  for (const segment of segments) {
    stream.segments.set(segment.runtimeId, { ...segment, stream });
  }
  const getSegmentData = vi.fn(() =>
    Promise.resolve(new Uint8Array(100).fill(1).buffer),
  );
  const storage = {
    getStoredSegmentIds: () => [],
    hasSegment: () => true,
    getSegmentData,
  } as unknown as SegmentStorage;
  const config: StreamConfig = { ...Core.DEFAULT_STREAM_CONFIG };
  const eventTarget = new EventTarget<CoreEventMap>();
  const requests = new RequestsContainer(
    () => {},
    { all: new BandwidthCalculator(), http: new BandwidthCalculator() },
    eventTarget,
  );
  const loader = new P2PLoader(
    stream,
    requests,
    storage,
    config,
    new WebTorrentSocketPool(),
    eventTarget,
    "-PM0500-aaaaaaaaaaaa",
    () => {},
  );
  const channel = createChannel();
  manager.peerConnected?.({
    peerId: "-PM0500-remote000000",
    channel,
    trackerUrl: "wss://tracker.example/announce",
    close: () => undefined,
  });
  return { loader, channel, getSegmentData };
}

describe("a peer asked for a segment the stream no longer has", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("says it is absent, so the requester need not wait out its timeout", async () => {
    // The live window moved on between this peer's announcement and the
    // request: unanswered, the requester waits p2pNotReceivingBytesTimeoutMs,
    // fails the attempt and counts a timeout against a peer that is fine.
    const { loader, channel, getSegmentData } = setup([]);
    const before = counter("SegmentAbsent:not-in-stream");

    channel.deliver({ c: Command.PeerCommandType.SegmentRequest, i: 41, r: 9 });
    await vi.advanceTimersByTimeAsync(0);

    expect(channel.sent).toContainEqual({
      c: Command.PeerCommandType.SegmentAbsent,
      i: 41,
      r: 9,
    });
    expect(getSegmentData).not.toHaveBeenCalled();
    expect(counter("SegmentAbsent:not-in-stream")).toBe(before + 1);
    loader.destroy();
  });

  it("still uploads a segment the stream has", async () => {
    const segment = {
      runtimeId: "seg-41",
      externalId: 41,
      url: "https://cdn.example/live/41.ts",
      startTime: 0,
      endTime: 6,
    } as SegmentWithStream;
    const { loader, channel, getSegmentData } = setup([segment]);
    const before = counter("SegmentAbsent:not-in-stream");

    channel.deliver({ c: Command.PeerCommandType.SegmentRequest, i: 41, r: 9 });
    await vi.advanceTimersByTimeAsync(0);

    expect(getSegmentData).toHaveBeenCalledTimes(1);
    expect(channel.sent).toContainEqual(
      expect.objectContaining({
        c: Command.PeerCommandType.SegmentData,
        i: 41,
        r: 9,
      }),
    );
    expect(counter("SegmentAbsent:not-in-stream")).toBe(before);
    loader.destroy();
  });
});
