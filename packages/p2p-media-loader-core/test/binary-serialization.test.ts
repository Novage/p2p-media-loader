import { describe, it, expect } from "vitest";
import {
  getRequiredBytesForInt,
  serializeInt,
  deserializeInt,
  serializeUniqueSimilarIntArray,
  deserializeUniqueSimilarIntArray,
  serializeString,
  deserializeString,
} from "../src/p2p/commands/binary-serialization.js";
import {
  BinaryCommandCreator,
  BinaryCommandChunksJoiner,
  deserializeCommand,
} from "../src/p2p/commands/binary-command-creator.js";

// An independent oracle: the byte width read straight off the binary
// representation, which the bit-arithmetic implementation must agree with at
// every value.
function bytesFromBinaryString(num: number): number {
  const binaryString = num.toString(2);
  const necessaryBits = num < 0 ? binaryString.length : binaryString.length + 1;
  return Math.ceil(necessaryBits / 8);
}

describe("binary-serialization", () => {
  describe("getRequiredBytesForInt", () => {
    it("matches the byte width read off the binary representation for positive integers", () => {
      for (let i = 0; i <= 10000; i++) {
        expect(getRequiredBytesForInt(i)).toBe(bytesFromBinaryString(i));
      }
    });

    it("matches the byte width read off the binary representation for negative integers", () => {
      for (let i = -10000; i < 0; i++) {
        expect(getRequiredBytesForInt(i)).toBe(bytesFromBinaryString(i));
      }
    });

    it("matches the byte width read off the binary representation at the extremes", () => {
      expect(getRequiredBytesForInt(Number.MAX_SAFE_INTEGER)).toBe(
        bytesFromBinaryString(Number.MAX_SAFE_INTEGER),
      );
      expect(getRequiredBytesForInt(-Number.MAX_SAFE_INTEGER)).toBe(
        bytesFromBinaryString(-Number.MAX_SAFE_INTEGER),
      );
    });
  });

  describe("serializeInt and deserializeInt", () => {
    it("should correctly serialize and deserialize a positive integer", () => {
      const original = 123456;
      const serialized = serializeInt(original);
      const deserialized = deserializeInt(serialized);
      expect(deserialized.number).toBe(original);
      expect(deserialized.byteLength).toBe(serialized.length);
    });

    it("should correctly serialize and deserialize a negative integer", () => {
      const original = -987654;
      const serialized = serializeInt(original);
      const deserialized = deserializeInt(serialized);
      expect(deserialized.number).toBe(original);
      expect(deserialized.byteLength).toBe(serialized.length);
    });

    it("should throw an error when deserializing a truncated integer buffer", () => {
      const original = 123456;
      const serialized = serializeInt(original);
      const truncated = serialized.subarray(0, serialized.length - 1);
      expect(() => deserializeInt(truncated)).toThrow("Buffer is too short");
    });

    it("should throw an error when deserializing an empty buffer", () => {
      expect(() => deserializeInt(new Uint8Array(0))).toThrow(
        "Buffer is too short",
      );
    });

    it("should correctly serialize and deserialize zero", () => {
      const serialized = serializeInt(0);
      const deserialized = deserializeInt(serialized);
      expect(deserialized.number).toBe(0);
      expect(deserialized.byteLength).toBe(serialized.length);
    });

    it("should throw an error when metadata has zero byte length", () => {
      // Crafted byte: SerializedItem.Int (0) << 4 | 0 = 0x00
      const malformed = new Uint8Array([0x00]);
      expect(() => deserializeInt(malformed)).toThrow(
        "Invalid integer: zero byte length",
      );
    });

    it("should throw an error when byte length exceeds 7 bytes", () => {
      // Crafted byte: SerializedItem.Int (0) << 4 | 8 = 0x08
      const malformed = new Uint8Array([0x08, 1, 2, 3, 4, 5, 6, 7, 8]);
      expect(() => deserializeInt(malformed)).toThrow(
        "Invalid integer: byte length exceeds safe integer limit",
      );
    });
  });

  describe("serializeUniqueSimilarIntArray and deserializeUniqueSimilarIntArray", () => {
    // Tests for serializeUniqueSimilarIntArray
    it("should correctly serialize and deserialize a small array of unique integers", () => {
      const original = [1, 5, 10, 256, 258, 512];
      const serialized = serializeUniqueSimilarIntArray(original);
      const deserialized = deserializeUniqueSimilarIntArray(serialized);
      expect(deserialized.numbers).toEqual(original);
    });

    it("should correctly serialize and deserialize exactly 256 contiguous integers (edge case fixed)", () => {
      const original = Array.from({ length: 256 }, (_, i) => i);
      const serialized = serializeUniqueSimilarIntArray(original);
      const deserialized = deserializeUniqueSimilarIntArray(serialized);
      expect(deserialized.numbers).toEqual(original);
    });

    it("should correctly serialize and deserialize exactly 256 contiguous integers starting at an offset", () => {
      const original = Array.from({ length: 256 }, (_, i) => i + 512);
      const serialized = serializeUniqueSimilarIntArray(original);
      const deserialized = deserializeUniqueSimilarIntArray(serialized);
      expect(deserialized.numbers).toEqual(original);
    });

    it("should correctly serialize and deserialize exactly 256 contiguous integers with other disjoint integers", () => {
      const contiguous = Array.from({ length: 256 }, (_, i) => i + 256);
      const original = [1, 2, ...contiguous, 1024, 1025];
      const serialized = serializeUniqueSimilarIntArray(original);
      const deserialized = deserializeUniqueSimilarIntArray(serialized);
      expect(deserialized.numbers).toEqual(original);
    });

    it("should correctly serialize and deserialize > 256 contiguous integers (spanning multiple 256-item buckets)", () => {
      const original = Array.from({ length: 1000 }, (_, i) => i);
      const serialized = serializeUniqueSimilarIntArray(original);
      const deserialized = deserializeUniqueSimilarIntArray(serialized);
      expect(deserialized.numbers).toEqual(original);
    });

    it("should throw an error when deserializing a truncated buffer (missing diff bytes)", () => {
      const original = [1, 5, 10, 256, 258, 512];
      const serialized = serializeUniqueSimilarIntArray(original);
      const truncated = serialized.subarray(0, serialized.length - 1);
      expect(() => deserializeUniqueSimilarIntArray(truncated)).toThrow(
        "Malformed similar int array: buffer too short",
      );
    });

    it("should throw an error when deserializing a truncated buffer (missing serialization metadata)", () => {
      const original = [1, 5, 10, 256, 258, 512];
      const serialized = serializeUniqueSimilarIntArray(original);
      const truncated = serialized.subarray(0, serialized.length - 2);
      expect(() => deserializeUniqueSimilarIntArray(truncated)).toThrow(
        "Buffer is too short",
      );
    });

    it("should throw an error when deserializing a truncated buffer (missing metadata bytes)", () => {
      const original = [1, 5, 10, 256, 258, 512];
      const serialized = serializeUniqueSimilarIntArray(original);
      const truncated = serialized.subarray(0, 5);
      expect(() => deserializeUniqueSimilarIntArray(truncated)).toThrow();
    });
  });

  describe("serializeUniqueSimilarIntArray edge cases", () => {
    it("should correctly serialize and deserialize an empty array", () => {
      const original: number[] = [];
      const serialized = serializeUniqueSimilarIntArray(original);
      const deserialized = deserializeUniqueSimilarIntArray(serialized);
      expect(deserialized.numbers).toEqual(original);
    });

    it("should correctly serialize and deserialize a single-element array", () => {
      const original = [42];
      const serialized = serializeUniqueSimilarIntArray(original);
      const deserialized = deserializeUniqueSimilarIntArray(serialized);
      expect(deserialized.numbers).toEqual(original);
    });
  });

  describe("serializeString and deserializeString", () => {
    it("should correctly serialize and deserialize a string", () => {
      const original = "https://example.com/playlist.m3u8";
      const serialized = serializeString(original);
      const deserialized = deserializeString(serialized);
      expect(deserialized.string).toBe(original);
      expect(deserialized.byteLength).toBe(serialized.byteLength);
    });

    it("deserializeString should throw error on malformed buffer (too short)", () => {
      // codeByte = SerializedItem.String << 4 = 2 << 4 = 32
      // lengthByte = 5
      const bytes = new Uint8Array([32, 5, 97, 98, 99]); // only 3 chars, expected 5
      expect(() => deserializeString(bytes)).toThrow(
        "Malformed string: buffer too short",
      );
    });
  });

  describe("deserializeCommand", () => {
    it("should correctly serialize and deserialize a command", () => {
      const creator = new BinaryCommandCreator(1, 1024); // PeerCommandType.SegmentRequest, maxChunkLength=1024
      creator.addInteger("i", 100);
      creator.addInteger("r", 50);
      creator.complete();
      const buffers = creator.getResultBuffers();

      let unframed!: Uint8Array;
      const joiner = new BinaryCommandChunksJoiner((buf) => {
        unframed = buf;
      });
      for (const buf of buffers) {
        joiner.addCommandChunk(new Uint8Array(buf));
      }

      const deserialized = deserializeCommand(unframed);
      expect(deserialized.c).toBe(1);
      if (deserialized.c === 1) {
        // PeerCommandType.SegmentRequest
        expect(deserialized.i).toBe(100);
        expect(deserialized.r).toBe(50);
      }
    });

    it("deserializeCommand should throw error on truncated name/type header", () => {
      const bytes = new Uint8Array([1, 105]); // commandCode, then name 'i', but no type byte
      expect(() => deserializeCommand(bytes)).toThrow(
        "Malformed command buffer: truncated name/type header",
      );
    });
  });
});
