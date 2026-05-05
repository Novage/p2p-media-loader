import { describe, it, expect } from "vitest";
import { sha1 } from "../src/utils/hash.js";
import crypto from "crypto";

describe("hash.ts", () => {
  describe("sha1", () => {
    it("should correctly hash a simple string", () => {
      const testStr = "hello world123!@#";
      const nodeHash = crypto.createHash("sha1").update(testStr).digest("binary");
      expect(sha1(testStr)).toBe(nodeHash);
    });

    it("should correctly hash an empty string", () => {
      const testStr = "";
      const nodeHash = crypto.createHash("sha1").update(testStr).digest("binary");
      expect(sha1(testStr)).toBe(nodeHash);
    });

    it("should correctly hash a long string", () => {
      const testStr = "a".repeat(1000);
      const nodeHash = crypto.createHash("sha1").update(testStr).digest("binary");
      expect(sha1(testStr)).toBe(nodeHash);
    });

    it("should correctly hash strings with non-ASCII characters", () => {
      const testStr = "привіт світ 🔥";
      const nodeHash = crypto.createHash("sha1").update(testStr).digest("binary");
      expect(sha1(testStr)).toBe(nodeHash);
    });

    it("should produce a 20-byte binary string", () => {
      const testStr = "test";
      const hash = sha1(testStr);
      expect(hash.length).toBe(20);
    });
  });
});
