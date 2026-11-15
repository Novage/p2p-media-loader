import { describe, expect, it } from "vitest";
import { parseSidx } from "../src/manifest/mp4-sidx.js";
import { readBinaryFixture } from "./fixtures/index.js";

/** Builds a `sidx` box; version 1 writes 64-bit time and offset. */
function sidxBox(options: {
  version: 0 | 1;
  timescale: number;
  earliestPresentationTime: number;
  firstOffset: number;
  references: { type?: 0 | 1; size: number; duration: number }[];
}): Uint8Array {
  const { version, references } = options;
  const wide = version === 1 ? 8 : 4;
  const size = 8 + 4 + 4 + 4 + wide * 2 + 4 + references.length * 12;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, size);
  bytes.set([0x73, 0x69, 0x64, 0x78], 4); // "sidx"
  view.setUint8(8, version);
  view.setUint32(12, 1); // reference_ID
  view.setUint32(16, options.timescale);
  let pos = 20;
  for (const value of [options.earliestPresentationTime, options.firstOffset]) {
    if (version === 1) {
      view.setUint32(pos, Math.floor(value / 0x100000000));
      view.setUint32(pos + 4, value >>> 0);
    } else {
      view.setUint32(pos, value);
    }
    pos += wide;
  }
  view.setUint16(pos, 0);
  view.setUint16(pos + 2, references.length);
  pos += 4;
  for (const r of references) {
    view.setUint32(pos, (((r.type ?? 0) << 31) >>> 0) | r.size);
    view.setUint32(pos + 4, r.duration);
    view.setUint32(pos + 8, 0x90000000);
    pos += 12;
  }
  return bytes;
}

function box(type: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(8 + payload.length);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  bytes.set(
    Array.from(type, (c) => c.charCodeAt(0)),
    4,
  );
  bytes.set(payload, 8);
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

describe("sidx parsing", () => {
  const refs = [
    { size: 1000, duration: 96000 },
    { size: 1200, duration: 96000 },
    { size: 800, duration: 48000 },
  ];

  it("reads a version 0 box", () => {
    const sidx = parseSidx(
      sidxBox({
        version: 0,
        timescale: 48000,
        earliestPresentationTime: 0,
        firstOffset: 0,
        references: refs,
      }),
    );
    expect(sidx).toEqual({
      boxOffset: 0,
      boxSize: 8 + 4 + 4 + 4 + 8 + 4 + refs.length * 12,
      timescale: 48000,
      earliestPresentationTime: 0,
      firstOffset: 0,
      references: refs.map((r) => ({
        referenceType: 0,
        referencedSize: r.size,
        subsegmentDuration: r.duration,
      })),
    });
  });

  it("reads a version 1 box with 64-bit fields", () => {
    const sidx = parseSidx(
      sidxBox({
        version: 1,
        timescale: 90000,
        earliestPresentationTime: 5_000_000_000,
        firstOffset: 16,
        references: refs,
      }),
    );
    expect(sidx?.earliestPresentationTime).toBe(5_000_000_000);
    expect(sidx?.firstOffset).toBe(16);
  });

  it("finds the box behind styp and other boxes, as in a combined init+index fetch", () => {
    const data = concat(
      box("styp", new Uint8Array(12)),
      box("free", new Uint8Array(3)),
      sidxBox({
        version: 0,
        timescale: 48000,
        earliestPresentationTime: 0,
        firstOffset: 0,
        references: refs,
      }),
    );
    const sidx = parseSidx(data);
    expect(sidx?.references).toHaveLength(3);
    // 20 bytes of styp, 11 of free: the box's own position is reported so the
    // registry can anchor subsegments on the box, not on the response start.
    expect(sidx?.boxOffset).toBe(31);
  });

  it("flags references to further index boxes", () => {
    const sidx = parseSidx(
      sidxBox({
        version: 0,
        timescale: 1,
        earliestPresentationTime: 0,
        firstOffset: 0,
        references: [{ type: 1, size: 500, duration: 10 }],
      }),
    );
    expect(sidx?.references[0]).toMatchObject({
      referenceType: 1,
      referencedSize: 500,
    });
  });

  it("returns undefined for truncated data, absent box, or unsafe 64-bit values", () => {
    const whole = sidxBox({
      version: 0,
      timescale: 48000,
      earliestPresentationTime: 0,
      firstOffset: 0,
      references: refs,
    });
    expect(parseSidx(whole.subarray(0, whole.length - 5))).toBeUndefined();
    expect(parseSidx(box("moov", new Uint8Array(20)))).toBeUndefined();
    const unsafe = sidxBox({
      version: 1,
      timescale: 1,
      earliestPresentationTime: 0,
      firstOffset: 0,
      references: [],
    });
    new DataView(unsafe.buffer).setUint32(20, 0x00400000); // high word beyond 2^53
    expect(parseSidx(unsafe)).toBeUndefined();
  });

  it("parses the real angel-one audio index: 16 subsegments of 4.01 s at 48 kHz", () => {
    const sidx = parseSidx(readBinaryFixture("angel-one-audio-en.sidx"));
    expect(sidx).toBeDefined();
    expect(sidx?.timescale).toBe(48000);
    expect(sidx?.firstOffset).toBe(0);
    expect(sidx?.references).toHaveLength(16);
    expect(sidx?.references[0]).toMatchObject({
      referenceType: 0,
      subsegmentDuration: 192512,
    });
  });
});
