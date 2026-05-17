import { describe, it, expect } from "vitest";
import { getRequiredBytesForInt } from "../src/p2p/commands/binary-serialization.js";

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
});
