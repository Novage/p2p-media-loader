import { describe, expect, it, vi } from "vitest";
import { EngineRequest } from "../src/requests/engine-request.js";
import type { SegmentWithStream } from "../src/internal-types.js";
import type { SegmentResponse } from "../src/types.js";

/**
 * What core stores is what it seeds to peers, so nothing a player can reach
 * may alias it. Players transfer the buffer they are given to a transmuxing
 * worker, and a transfer detaches the buffer it came from.
 */

const segment = { externalId: 1 } as SegmentWithStream;

function deliver(data: ArrayBuffer) {
  const onSuccess = vi.fn();
  const request = new EngineRequest(segment, {
    onSuccess,
    onError: vi.fn(),
  });
  request.resolve(data, 1000);
  return (onSuccess.mock.calls[0] as [SegmentResponse])[0];
}

describe("segment bytes handed to a player", () => {
  it("are a copy, not the buffer core keeps", () => {
    const stored = new Uint8Array([1, 2, 3, 4]).buffer;
    const delivered = deliver(stored);

    expect(delivered.data).not.toBe(stored);
    expect(new Uint8Array(delivered.data)).toEqual(new Uint8Array(stored));
  });

  it("survive the player transferring them to a worker", () => {
    const stored = new Uint8Array([1, 2, 3, 4]).buffer;
    const delivered = deliver(stored);

    // What a transmuxing worker handoff does to the buffer it is given.
    structuredClone(delivered.data, { transfer: [delivered.data] });

    expect(delivered.data.byteLength).toBe(0);
    expect(stored.byteLength).toBe(4);
    expect(new Uint8Array(stored)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
});
