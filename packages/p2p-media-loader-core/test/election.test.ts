import { describe, expect, it } from "vitest";
import {
  hash32,
  rankForSegment,
  shouldFetchNow,
  wallSecondsToHighDemand,
} from "../src/utils/election.js";

const PEERS = [
  "-PM0400-aaaaaaaaaaaa",
  "-PM0400-bbbbbbbbbbbb",
  "-PM0400-cccccccccccc",
];
const others = (self: string) => PEERS.filter((p) => p !== self);

describe("HTTP owner election", () => {
  it("hashes deterministically", () => {
    expect(hash32("abc")).toBe(hash32("abc"));
    expect(hash32("abc")).not.toBe(hash32("abd"));
  });

  it("elects exactly one owner per segment among fully connected peers", () => {
    for (let externalId = 80000; externalId < 80200; externalId++) {
      const owners = PEERS.filter(
        (p) => rankForSegment(p, others(p), externalId) === 0,
      );
      expect(owners).toHaveLength(1);
    }
  });

  it("rotates ownership across segments", () => {
    const counts = new Map(PEERS.map((p) => [p, 0]));
    for (let externalId = 80000; externalId < 80600; externalId++) {
      const owner = PEERS.find(
        (p) => rankForSegment(p, others(p), externalId) === 0,
      );
      if (owner) counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
    // A third each, within a few standard deviations (σ ≈ 11.5 for 600
    // segments at p = 1/3): no peer starves and none dominates.
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(150);
      expect(count).toBeLessThan(250);
    }
  });

  it("never lets two connected peers both own a segment, and always elects someone", () => {
    // A partial mesh: a-b and b-c are connected, a-c are not.
    const [a, b, c] = PEERS;
    let relayed = 0;
    for (let externalId = 80000; externalId < 80300; externalId++) {
      const aOwns = rankForSegment(a, [b], externalId) === 0;
      const bOwns = rankForSegment(b, [a, c], externalId) === 0;
      const cOwns = rankForSegment(c, [b], externalId) === 0;
      expect(aOwns && bOwns).toBe(false);
      expect(bOwns && cOwns).toBe(false);
      // The global minimum is always an owner, so the segment enters the swarm.
      expect(aOwns || bOwns || cOwns).toBe(true);
      // A peer whose only neighbour is not the owner gets the segment relayed:
      // b takes it from c, then a takes it from b.
      if (!aOwns && !bOwns) relayed++;
    }
    expect(relayed).toBeGreaterThan(0);
  });

  it("makes a peer with no neighbours the owner of everything", () => {
    expect(rankForSegment(PEERS[0], [], 1) === 0).toBe(true);
  });
});

describe("backup ranking and deadlines", () => {
  it("ranks peers in score order, with the owner at rank 0", () => {
    for (let externalId = 80000; externalId < 80100; externalId++) {
      const ranks = PEERS.map((p) =>
        rankForSegment(p, others(p), externalId),
      ).sort();
      expect(ranks).toEqual([0, 1, 2]);
    }
  });

  it("lets the owner fetch at once and backups only as the deadline nears", () => {
    const fetch = 1; // one second per segment on this link
    // Plenty of time: nobody but the owner.
    expect(
      shouldFetchNow({
        rank: 0,
        secondsToHighDemand: 20,
        estimatedFetchSeconds: fetch,
      }),
    ).toBe(true);
    expect(
      shouldFetchNow({
        rank: 1,
        secondsToHighDemand: 20,
        estimatedFetchSeconds: fetch,
      }),
    ).toBe(false);
    expect(
      shouldFetchNow({
        rank: 2,
        secondsToHighDemand: 20,
        estimatedFetchSeconds: fetch,
      }),
    ).toBe(false);
    // First backup steps in at twice the fetch time (+ allowance), the second not yet.
    expect(
      shouldFetchNow({
        rank: 1,
        secondsToHighDemand: 2.4,
        estimatedFetchSeconds: fetch,
      }),
    ).toBe(true);
    expect(
      shouldFetchNow({
        rank: 2,
        secondsToHighDemand: 2.4,
        estimatedFetchSeconds: fetch,
      }),
    ).toBe(false);
    // The second at one and a half.
    expect(
      shouldFetchNow({
        rank: 2,
        secondsToHighDemand: 1.9,
        estimatedFetchSeconds: fetch,
      }),
    ).toBe(true);
    // A slow link moves every deadline earlier.
    expect(
      shouldFetchNow({
        rank: 1,
        secondsToHighDemand: 8,
        estimatedFetchSeconds: 4,
      }),
    ).toBe(true);
  });
});

describe("wallSecondsToHighDemand", () => {
  it("measures the distance in wall-clock seconds, as the fetch estimate is", () => {
    // 8 media seconds beyond a 15 s window: 8 s away at rate 1, 4 s at 2x.
    expect(wallSecondsToHighDemand(23, 15, 1)).toBe(8);
    expect(wallSecondsToHighDemand(38, 15, 2)).toBe(4);
  });

  it("treats a paused player as playing at 1x", () => {
    expect(wallSecondsToHighDemand(23, 15, 0)).toBe(8);
  });
});
