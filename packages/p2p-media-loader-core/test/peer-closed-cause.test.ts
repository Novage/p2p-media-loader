import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P2PLoader } from "../src/p2p/loader.js";
import { RequestsContainer } from "../src/requests/request-container.js";
import { WebTorrentSocketPool } from "../src/webtorrent/webtorrent-socket-pool/index.js";
import { BandwidthCalculator } from "../src/bandwidth-calculator.js";
import { EventTarget } from "../src/utils/event-target.js";
import { Core } from "../src/core.js";
import * as Command from "../src/p2p/commands/index.js";
import {
  PeerError,
  type CoreEventMap,
  type SegmentErrorDetails,
  type SegmentStorage,
  type StreamConfig,
} from "../src/types.js";
import type {
  SegmentWithStream,
  StreamWithSegments,
} from "../src/internal-types.js";

/** The manager of the loader under test: it connects and disconnects the peers the test names. */
const manager = vi.hoisted(() => ({
  listeners: new Map<string, (event: unknown) => void>(),
}));

vi.mock("../src/webtorrent/webtorrent-manager/index.js", () => ({
  WebTorrentManager: class {
    addEventListener(name: string, listener: (event: unknown) => void) {
      manager.listeners.set(name, listener);
    }
    start() {}
    destroy() {}
  },
}));

const MAX_MESSAGE_SIZE = 64 * 1024 - 1;
const PEER_ID = "-PM0500-remote000000";
const TRACKER_URL = "wss://tracker.example/announce";

function createChannel() {
  const listeners: ((event: unknown) => void)[] = [];
  return {
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

/** A loader whose one peer is downloading segment 41 when the test starts. */
function setupDownloading() {
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
  const segment = {
    runtimeId: "seg-41",
    externalId: 41,
    url: "https://cdn.example/live/41.ts",
    startTime: 0,
    endTime: 6,
    stream,
  } as unknown as SegmentWithStream;
  stream.segments.set(segment.runtimeId, segment);

  const storage = {
    getStoredSegmentIds: () => [],
    hasSegment: () => false,
  } as unknown as SegmentStorage;
  const config: StreamConfig = { ...Core.DEFAULT_STREAM_CONFIG };
  const eventTarget = new EventTarget<CoreEventMap>();
  const errors: SegmentErrorDetails[] = [];
  eventTarget.addEventListener("onSegmentError", (details) => {
    errors.push(details);
  });
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
  manager.listeners.get("peerConnected")?.({
    peerId: PEER_ID,
    channel,
    trackerUrl: TRACKER_URL,
    close: () => undefined,
  });
  channel.deliver({ c: Command.PeerCommandType.SegmentsAnnouncement, l: [41] });
  expect(loader.downloadSegment(segment)).toBe(true);

  const disconnect = (
    cause: { error: PeerError } | { disconnectReason: string },
  ) => {
    manager.listeners.get("peerDisconnected")?.({
      peerId: PEER_ID,
      trackerUrl: TRACKER_URL,
      ...cause,
    });
  };
  return { loader, errors, disconnect };
}

describe("a peer that disconnects during a download", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives the download's peer-closed error the fault as its cause", () => {
    const { loader, errors, disconnect } = setupDownloading();
    const fault = new PeerError("connection-lost", "ICE failed");

    disconnect({ error: fault });

    expect(errors).toHaveLength(1);
    expect(errors[0].peerId).toBe(PEER_ID);
    expect(errors[0].error.type).toBe("peer-closed");
    expect(errors[0].error.cause).toBe(fault);
    loader.destroy();
  });

  it("gives no cause for an expected close", () => {
    const { loader, errors, disconnect } = setupDownloading();

    disconnect({ disconnectReason: "closed by peer" });

    expect(errors).toHaveLength(1);
    expect(errors[0].error.type).toBe("peer-closed");
    expect(errors[0].error.cause).toBeUndefined();
    loader.destroy();
  });
});
