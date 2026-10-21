import { describe, expect, it } from "vitest";
import {
  byteRangeFromHalfOpen,
  byteRangeFromOffsetLength,
  byteRangeFromRangeHeader,
  normalizeUrl,
  resolveUrl,
  segmentKey,
} from "../src/manifest/url-key.js";

describe("normalizeUrl", () => {
  it("strips CMCD and nothing else", () => {
    const url =
      "https://cdn.example/seg-1.ts?token=abc.def&CMCD=bl%3D21300%2Cbr%3D3200&x=1";
    expect(normalizeUrl(url)).toBe(
      "https://cdn.example/seg-1.ts?token=abc.def&x=1",
    );
  });

  it("drops the query entirely when CMCD was its only parameter", () => {
    expect(normalizeUrl("https://cdn.example/s.ts?CMCD=bl%3D1")).toBe(
      "https://cdn.example/s.ts",
    );
  });

  it("carries a signed token over exactly as the manifest wrote it", () => {
    // Serializing the surviving query again would re-encode these, and the
    // manifest, having nothing to strip, is never re-encoded: every lookup
    // from a request would miss and P2P would quietly never engage.
    const signed = [
      "https://cdn.example/s.ts?hdnts=exp=1758000000~acl=/*~hmac=9f2c1a",
      "https://cdn.example/s.ts?Policy=eyJTdGF0ZW1lbnQi~&Signature=Gd3-x_y~z",
      "https://cdn.example/s.ts?sv=2021-08-06&se=2026-01-01T00:00:00Z",
      "https://cdn.example/s.ts?a=one%20two&b=one+two&c=(x)",
    ];
    for (const url of signed) {
      expect(normalizeUrl(`${url}&CMCD=br%3D1200%2Cot%3Dv`)).toBe(url);
    }
  });

  it("strips every CMCD parameter, with or without a value", () => {
    expect(normalizeUrl("https://cdn.example/s.ts?CMCD=a&k=1&CMCD=b")).toBe(
      "https://cdn.example/s.ts?k=1",
    );
    expect(normalizeUrl("https://cdn.example/s.ts?CMCD&k=1")).toBe(
      "https://cdn.example/s.ts?k=1",
    );
  });

  it("returns the input untouched when there is nothing to strip", () => {
    const signed = "https://cdn.example/s.ts?token=xyz&Expires=1";
    expect(normalizeUrl(signed)).toBe(signed);
    expect(normalizeUrl("https://cdn.example/s.ts")).toBe(
      "https://cdn.example/s.ts",
    );
  });
});

describe("segmentKey", () => {
  it("is the URL alone without a byte range", () => {
    expect(segmentKey("https://cdn.example/s.ts")).toBe(
      "https://cdn.example/s.ts",
    );
  });

  it("appends an inclusive byte range in the engines' runtime-id format", () => {
    expect(
      segmentKey("https://cdn.example/m.mp4", { start: 600, end: 1599 }),
    ).toBe("https://cdn.example/m.mp4|600-1599");
  });

  it("normalizes before keying so a CMCD request finds its segment", () => {
    expect(segmentKey("https://cdn.example/s.ts?CMCD=x")).toBe(
      segmentKey("https://cdn.example/s.ts"),
    );
  });

  it("keys a CMCD request the same as the signed URL the manifest listed", () => {
    const signed = "https://cdn.example/s.ts?hdnts=exp=1758000000~hmac=9f2c1a";
    expect(segmentKey(`${signed}&CMCD=br%3D1200`, { start: 0, end: 9 })).toBe(
      segmentKey(signed, { start: 0, end: 9 }),
    );
  });
});

describe("byte range conversions", () => {
  it("m3u8 offset/length becomes an inclusive range", () => {
    expect(byteRangeFromOffsetLength({ offset: 600, length: 1000 })).toEqual({
      start: 600,
      end: 1599,
    });
    expect(byteRangeFromOffsetLength({ offset: 0, length: 0 })).toBeUndefined();
    expect(byteRangeFromOffsetLength(undefined)).toBeUndefined();
  });

  it("starts a range written as a bare length at the beginning of the resource", () => {
    // `EXT-X-MAP:BYTERANGE="600"`: m3u8-parser fills the offset in for media
    // segments, from the end of the previous one, and leaves it out here.
    expect(byteRangeFromOffsetLength({ length: 600 })).toEqual({
      start: 0,
      end: 599,
    });
  });

  it("makes no range at all out of a length that is not a number", () => {
    // A key holding NaN would match no request ever made, and the segment
    // would look unknown to every lookup.
    const broken = { offset: NaN, length: NaN } as unknown as {
      offset: number;
      length: number;
    };
    expect(byteRangeFromOffsetLength(broken)).toBeUndefined();
    expect(byteRangeFromOffsetLength({ offset: NaN, length: 600 })).toEqual({
      start: 0,
      end: 599,
    });
  });

  it("a Range header becomes an inclusive range", () => {
    expect(byteRangeFromRangeHeader("bytes=0-699")).toEqual({
      start: 0,
      end: 699,
    });
    expect(byteRangeFromRangeHeader("bytes=700-")).toBeUndefined();
    expect(byteRangeFromRangeHeader(undefined)).toBeUndefined();
  });

  it("a half-open player range becomes inclusive", () => {
    expect(byteRangeFromHalfOpen(600, 1600)).toEqual({ start: 600, end: 1599 });
    expect(byteRangeFromHalfOpen(600, 600)).toBeUndefined();
    expect(byteRangeFromHalfOpen(undefined, 10)).toBeUndefined();
  });
});

describe("resolveUrl", () => {
  it("resolves relative URIs against the declaring document", () => {
    expect(
      resolveUrl("720p/index.m3u8", "https://cdn.example/live/master.m3u8"),
    ).toBe("https://cdn.example/live/720p/index.m3u8");
    expect(resolveUrl("/abs/seg.ts", "https://cdn.example/live/x.m3u8")).toBe(
      "https://cdn.example/abs/seg.ts",
    );
    expect(resolveUrl("https://other/seg.ts", "https://cdn.example/x")).toBe(
      "https://other/seg.ts",
    );
  });
});
