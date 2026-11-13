import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataChannelSender } from "../src/webtorrent/data-channel-sender.js";

const MAX_MESSAGE_SIZE = 64 * 1024 - 1;
const STALL_TIMEOUT_MS = 10_000;
const SEGMENT_SIZE = 1024 * 1024;

/**
 * Enough of an `RTCDataChannel` for the sender: what it sends accumulates in
 * the buffer and only leaves when the test says the peer read it.
 */
function createChannel() {
  const listeners = new Map<string, (() => void)[]>();
  return {
    readyState: "open",
    bufferedAmount: 0,
    bufferedAmountLowThreshold: 0,
    sentBytes: 0,
    send(chunk: Uint8Array) {
      this.bufferedAmount += chunk.byteLength;
      this.sentBytes += chunk.byteLength;
    },
    addEventListener(type: string, listener: () => void) {
      const existing = listeners.get(type) ?? [];
      existing.push(listener);
      listeners.set(type, existing);
    },
    removeEventListener(type: string, listener: () => void) {
      const existing = listeners.get(type) ?? [];
      listeners.set(
        type,
        existing.filter((entry) => entry !== listener),
      );
    },
    /** The peer reads everything buffered, as a healthy one would. */
    drain() {
      this.bufferedAmount = 0;
      this.notifyDrain();
    },
    notifyDrain() {
      for (const listener of listeners.get("bufferedamountlow") ?? []) {
        listener();
      }
    },
  };
}

type FakeChannel = ReturnType<typeof createChannel>;

/** Sends a segment and records how the send ends, without blocking on it. */
function startSend(channel: FakeChannel) {
  const sender = new DataChannelSender(
    channel as unknown as RTCDataChannel,
    MAX_MESSAGE_SIZE,
  );
  const outcome: { value?: string } = {};
  const promise = sender.sendData(new Uint8Array(SEGMENT_SIZE)).then(
    () => (outcome.value = "sent"),
    (error: Error) => (outcome.value = error.message),
  );
  return { outcome, promise };
}

describe("DataChannelSender stall watchdog", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("gives up on a peer that stops reading", async () => {
    const channel = createChannel();
    const { outcome, promise } = startSend(channel);

    await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS - 1);
    expect(outcome.value).toBeUndefined();

    await vi.advanceTimersByTimeAsync(2);
    expect(outcome.value).toMatch(/stalled/);
    await promise;
  });

  it("keeps sending as long as the buffer drains", async () => {
    const channel = createChannel();
    const { outcome, promise } = startSend(channel);

    for (let pass = 0; pass < 20 && outcome.value === undefined; pass++) {
      // Just under the watchdog each time: progress rearms it, so a slow but
      // moving peer is never dropped.
      await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS - 1);
      channel.drain();
    }
    await promise;

    expect(outcome.value).toBe("sent");
    expect(channel.sentBytes).toBe(SEGMENT_SIZE);
    // Nothing is left armed once the send is done.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not extend the deadline when a drain brings no progress", async () => {
    const channel = createChannel();
    const { outcome, promise } = startSend(channel);

    await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS / 2);
    // The drain event arrives while the buffer is still full — a command sent
    // on the same channel refilled it — so nothing can be written and the
    // deadline has to stand.
    for (let event = 0; event < 3; event++) channel.notifyDrain();

    await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS / 2 + 1);
    expect(outcome.value).toMatch(/stalled/);
    await promise;
  });
});
