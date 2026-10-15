import { describe, expect, it } from "vitest";
import { HeldBytes, type ByteSource } from "../src/requests/held-bytes.js";

const http: ByteSource = { downloadSource: "http" };
const peer = (peerId: string): ByteSource => ({
  downloadSource: "p2p",
  peerId,
});
const bytes = (length: number, fill = 0) => new Uint8Array(length).fill(fill);

describe("HeldBytes", () => {
  it("joins the bytes in order", () => {
    const held = new HeldBytes(undefined);
    held.add(bytes(2, 1), peer("a"));
    held.add(bytes(3, 2), http);

    expect(held.length).toBe(5);
    expect(Array.from(new Uint8Array(held.data))).toEqual([1, 1, 2, 2, 2]);
  });

  it("belongs to the peer whose bytes it holds, however many HTTP bytes follow", () => {
    const held = new HeldBytes(undefined);
    held.add(bytes(2), peer("a"));
    held.add(bytes(8), http);

    expect(held.owner).toBe("a");
    expect(held.hasPeerBytes).toBe(true);
    expect(held.completionSource).toEqual(peer("a"));
  });

  it("belongs to no peer, and completes as HTTP's, with HTTP bytes only", () => {
    const held = new HeldBytes(undefined);
    held.add(bytes(4), http);

    expect(held.owner).toBeUndefined();
    expect(held.hasPeerBytes).toBe(false);
    expect(held.completionSource).toEqual(http);
  });

  it("names no owner for bytes from two peers, and completes as the latest", () => {
    // Possible only when nothing validates peers' bytes.
    const held = new HeldBytes(undefined);
    held.add(bytes(2), peer("a"));
    held.add(bytes(2), peer("b"));

    expect(held.owner).toBeUndefined();
    expect(held.completionSource).toEqual(peer("b"));
    expect(held.otherPeerThan("b")).toBe("a");
    expect(held.hasBytesFrom("a")).toBe(true);
  });

  it("finds no other peer for the one that sent the bytes, or for HTTP bytes", () => {
    const held = new HeldBytes(undefined);
    held.add(bytes(2), http);
    expect(held.otherPeerThan("a")).toBeUndefined();
    held.add(bytes(2), peer("a"));
    expect(held.otherPeerThan("a")).toBeUndefined();
    expect(held.otherPeerThan("b")).toBe("a");
  });

  it("records the peer that gave the size until HTTP agrees with it", () => {
    const held = new HeldBytes(undefined);
    held.setSize(10, peer("a"));
    expect(held.sizePeer).toBe("a");
    held.confirmSize();
    expect(held.sizePeer).toBeUndefined();
    expect(held.size).toBe(10);
  });

  it("records no peer for a size from HTTP, and sets a size once", () => {
    const held = new HeldBytes(undefined);
    held.setSize(10, http);
    expect(held.sizePeer).toBeUndefined();
    expect(() => held.setSize(12, http)).toThrow();
  });

  it("blames the peer that gave the size, or else the owner, for bytes past the end", () => {
    const held = new HeldBytes(undefined);
    held.add(bytes(2), peer("a"));
    expect(held.peerForExcessBytes).toBe("a");
    held.setSize(10, peer("b"));
    expect(held.peerForExcessBytes).toBe("b");
  });

  it("is complete at its size, and overflows past it", () => {
    const held = new HeldBytes(undefined);
    held.add(bytes(4), http);
    expect(held.isComplete).toBe(false);
    held.setSize(4, http);
    expect(held.isComplete).toBe(true);
    held.add(bytes(1), http);
    expect(held.isOverflow).toBe(true);
    expect(held.isComplete).toBe(false);
  });

  it("is not complete at a size of zero", () => {
    const held = new HeldBytes(undefined);
    held.setSize(0, http);
    expect(held.isComplete).toBe(false);
  });

  it("overflows a size of zero with any byte", () => {
    const held = new HeldBytes(undefined);
    held.setSize(0, http);
    expect(held.wouldOverflowWith(1)).toBe(true);
    held.add(bytes(1), http);
    expect(held.isOverflow).toBe(true);
  });

  it("is short of its size until every byte is held, and knows which chunk would overflow it", () => {
    const held = new HeldBytes(undefined);
    held.add(bytes(3), http);
    expect(held.isShort).toBe(false);
    expect(held.wouldOverflowWith(100)).toBe(false);

    held.setSize(5, http);
    expect(held.isShort).toBe(true);
    expect(held.wouldOverflowWith(2)).toBe(false);
    expect(held.wouldOverflowWith(3)).toBe(true);

    held.add(bytes(2), http);
    expect(held.isShort).toBe(false);
    expect(held.isComplete).toBe(true);
  });

  it("records no peer for an empty chunk", () => {
    const held = new HeldBytes(undefined);
    held.add(bytes(0), peer("a"));

    expect(held.hasPeerBytes).toBe(false);
    expect(held.owner).toBeUndefined();
    expect(held.completionSource).toEqual(http);
  });

  it("joins the bytes again after a chunk is added", () => {
    const held = new HeldBytes(undefined);
    held.add(bytes(2, 1), http);
    expect(held.data.byteLength).toBe(2);

    held.add(bytes(1, 2), http);
    held.add(bytes(1, 3), http);
    expect(Array.from(new Uint8Array(held.data))).toEqual([1, 1, 2, 3]);
    expect(held.data).toBe(held.data);
  });

  it("clears every byte and a size a source gave, and keeps a byte range's size", () => {
    const held = new HeldBytes(1000);
    held.add(bytes(2), peer("a"));
    held.add(bytes(2), http);
    held.clear();

    expect(held.length).toBe(0);
    expect(held.data.byteLength).toBe(0);
    expect(held.hasPeerBytes).toBe(false);
    expect(held.owner).toBeUndefined();
    expect(held.completionSource).toEqual(http);
    expect(held.size).toBe(1000);

    const sized = new HeldBytes(undefined);
    sized.setSize(10, peer("a"));
    sized.clear();
    expect(sized.size).toBeUndefined();
    expect(sized.sizePeer).toBeUndefined();
  });

  it("takes the bytes held as the size when the download completes", () => {
    const held = new HeldBytes(undefined);
    held.add(bytes(7), http);
    held.settleSize();
    expect(held.size).toBe(7);
  });

  it("records no peer for the size once the download completes", () => {
    const held = new HeldBytes(undefined);
    held.setSize(4, peer("a"));
    held.add(bytes(4), http);
    held.settleSize();
    expect(held.sizePeer).toBeUndefined();
  });
});
