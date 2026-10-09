import { describe, expect, it } from "vitest";
import debug from "debug";
import {
  SharedPlayhead,
  type PlayheadParticipant,
} from "../src/shared-playhead.js";
import type { Playback } from "../src/internal-types.js";
import { diagnostics as compiledLedger } from "../src/diagnostics.js";

// Absent only in a prebuilt bundle; the tests run on the source.
if (!compiledLedger) throw new Error("diagnostics are compiled out");
const ledger = compiledLedger;
// The ledger decides once, at its first record: on, for the whole file.
debug.enable("p2pml:diagnostics");
ledger.snapshot();
debug.disable();

const count = (name: string) => ledger.snapshot()?.counters[name] ?? 0;

/** A stream whose edge the test sets, `undefined` when it cannot take part. */
function stream(edge: number | undefined): PlayheadParticipant & {
  edge: number | undefined;
} {
  return {
    edge,
    currentEdge() {
      return this.edge;
    },
  };
}

/** What each stream's tracker says: its edge, and the one reported buffer. */
const reported = (bufferEdge: number, bufferAhead: number): Playback => ({
  bufferEdge,
  bufferAhead,
  rate: 1,
  source: "reported",
});

describe("SharedPlayhead", () => {
  it("gives the stream that runs ahead its own buffer, and the lagging one the reported", () => {
    // Video buffered to 40 s, audio to 45 s, playhead at 30 s: the player
    // reports 10 s, the lagging stream's.
    const shared = new SharedPlayhead();
    const video = stream(40);
    const audio = stream(45);
    shared.join(video);
    shared.join(audio);

    expect(shared.bufferAheadFor(video, reported(40, 10))).toBe(10);
    expect(shared.bufferAheadFor(audio, reported(45, 10))).toBe(15);
  });

  it("does not move the playhead when the leading stream's segment arrives", () => {
    const shared = new SharedPlayhead();
    const video = stream(40);
    const audio = stream(45);
    shared.join(video);
    shared.join(audio);
    audio.edge = 51;
    // The minimum is still video's edge, and the reported buffer is unchanged.
    const playhead = 51 - shared.bufferAheadFor(audio, reported(51, 10));
    expect(playhead).toBe(30);
  });

  it("keeps each stream's own view where it cannot take part", () => {
    const shared = new SharedPlayhead();
    const video = stream(40);
    const audio = stream(undefined); // another timeline, a pending seek…
    shared.join(video);
    shared.join(audio);
    expect(shared.bufferAheadFor(video, reported(40, 10))).toBe(10);
    expect(shared.bufferAheadFor(audio, reported(45, 10))).toBe(10);

    // An inferred estimate is a stream's own, and stays so.
    const inferred: Playback = { ...reported(45, 7), source: "inferred" };
    audio.edge = 45;
    expect(shared.bufferAheadFor(audio, inferred)).toBe(7);
  });

  it("leaves out the other streams after a seek one stream's request showed, until each requests", () => {
    // Without a seek count, a request is the only sign of a seek: video asks
    // for 100 s, and audio's edge still describes the position it left.
    const shared = new SharedPlayhead();
    const video = stream(100);
    const audio = stream(45);
    shared.join(video);
    shared.join(audio);

    shared.onSeek(video);
    expect(shared.bufferAheadFor(audio, reported(45, 0))).toBe(0);
    expect(shared.bufferAheadFor(video, reported(100, 0))).toBe(0);

    // Audio's own first request shows the same seek: it is catching up, and
    // must not leave video out in turn.
    audio.edge = 98;
    shared.onSeek(audio);
    expect(shared.bufferAheadFor(video, reported(100, 2))).toBe(4);
    expect(shared.bufferAheadFor(audio, reported(98, 2))).toBe(2);
  });

  it("lets a stream back in with its next request, and forgets one that leaves", () => {
    const shared = new SharedPlayhead();
    const video = stream(40);
    const audio = stream(45);
    shared.join(video);
    shared.join(audio);
    shared.onSeek(video);
    shared.onRequest(audio);
    expect(shared.bufferAheadFor(audio, reported(45, 10))).toBe(15);

    shared.leave(video);
    expect(shared.bufferAheadFor(audio, reported(45, 10))).toBe(10);
  });

  it("counts each answer by whether it was shared", () => {
    const shared = new SharedPlayhead();
    const video = stream(40);
    const audio = stream(45);
    shared.join(video);
    shared.join(audio);
    const before = { s: count("Playhead:shared"), o: count("Playhead:own") };

    shared.bufferAheadFor(audio, reported(45, 10));
    audio.edge = undefined;
    shared.bufferAheadFor(audio, reported(45, 10));

    expect(count("Playhead:shared")).toBe(before.s + 1);
    expect(count("Playhead:own")).toBe(before.o + 1);
  });
});
