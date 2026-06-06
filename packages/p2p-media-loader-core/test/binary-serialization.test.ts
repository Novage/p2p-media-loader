import { describe, it, expect } from "vitest";
import {
  getRequiredBytesForInt,
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

// Original toString(2) approach for testing equality
function getRequiredBytesForIntOld(num: number): number {
  const binaryString = num.toString(2);
  const necessaryBits = num < 0 ? binaryString.length : binaryString.length + 1;
  return Math.ceil(necessaryBits / 8);
}

describe("binary-serialization", () => {
  describe("getRequiredBytesForInt", () => {
    it("should match the original toString(2) approach for positive integers", () => {
      for (let i = 0; i <= 10000; i++) {
        expect(getRequiredBytesForInt(i)).toBe(getRequiredBytesForIntOld(i));
      }
    });

    it("should match the original toString(2) approach for negative integers", () => {
      for (let i = -10000; i < 0; i++) {
        expect(getRequiredBytesForInt(i)).toBe(getRequiredBytesForIntOld(i));
      }
    });

    it("should match the original toString(2) approach for extreme cases", () => {
      expect(getRequiredBytesForInt(Number.MAX_SAFE_INTEGER)).toBe(
        getRequiredBytesForIntOld(Number.MAX_SAFE_INTEGER),
      );
      expect(getRequiredBytesForInt(-Number.MAX_SAFE_INTEGER)).toBe(
        getRequiredBytesForIntOld(-Number.MAX_SAFE_INTEGER),
      );
    });
  });

  describe("serializeUniqueSimilarIntArray and deserializeUniqueSimilarIntArray", () => {
    // Tests for serializeUniqueSimilarIntArray
    it("should correctly serialize and deserialize a small array of unique integers", async () => {
      const original = [1, 5, 10, 256, 258, 512];
      const serialized = serializeUniqueSimilarIntArray(original);
      const deserialized = deserializeUniqueSimilarIntArray(serialized);
      expect(deserialized.numbers).toEqual(original);
    });

    it("should correctly serialize and deserialize exactly 256 contiguous integers (edge case fixed)", async () => {
      const original = Array.from({ length: 256 }, (_, i) => i);
      const serialized = serializeUniqueSimilarIntArray(original);
      const deserialized = deserializeUniqueSimilarIntArray(serialized);
      expect(deserialized.numbers).toEqual(original);
    });

    it("should correctly serialize and deserialize exactly 256 contiguous integers starting at an offset", async () => {
      const original = Array.from({ length: 256 }, (_, i) => i + 512);
      const serialized = serializeUniqueSimilarIntArray(original);
      const deserialized = deserializeUniqueSimilarIntArray(serialized);
      expect(deserialized.numbers).toEqual(original);
    });

    it("should correctly serialize and deserialize exactly 256 contiguous integers with other disjoint integers", async () => {
      const contiguous = Array.from({ length: 256 }, (_, i) => i + 256);
      const original = [1, 2, ...contiguous, 1024, 1025];
      const serialized = serializeUniqueSimilarIntArray(original);
      const deserialized = deserializeUniqueSimilarIntArray(serialized);
      expect(deserialized.numbers).toEqual(original);
    });

    it("should correctly serialize and deserialize > 256 contiguous integers (spanning multiple 256-item buckets)", async () => {
      const original = Array.from({ length: 1000 }, (_, i) => i);
      const serialized = serializeUniqueSimilarIntArray(original);
      const deserialized = deserializeUniqueSimilarIntArray(serialized);
      expect(deserialized.numbers).toEqual(original);
    });
  });

  describe("serializeString and deserializeString", () => {
    it("should correctly serialize and deserialize a string", async () => {
      const original = "https://example.com/playlist.m3u8";
      const serialized = serializeString(original);
      const deserialized = deserializeString(serialized);
      expect(deserialized.string).toBe(original);
      expect(deserialized.byteLength).toBe(serialized.byteLength);
    });

    it("deserializeString should throw error on malformed buffer (too short)", async () => {
      // codeByte = SerializedItem.String << 4 = 2 << 4 = 32
      // lengthByte = 5
      const bytes = new Uint8Array([32, 5, 97, 98, 99]); // only 3 chars, expected 5
      expect(() => deserializeString(bytes)).toThrow(
        "Malformed string: buffer too short",
      );
    });
  });

  describe("deserializeCommand", () => {
    it("should correctly serialize and deserialize a command", async () => {
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

    it("deserializeCommand should throw error on truncated name/type header", async () => {
      const bytes = new Uint8Array([1, 105]); // commandCode, then name 'i', but no type byte
      expect(() => deserializeCommand(bytes)).toThrow(
        "Malformed command buffer: truncated name/type header",
      );
    });
  });
});
