import { describe, expect, it } from "vitest";
import { debug, type ProcessedManifest } from "p2p-media-loader-core";
import { VhsLivePlacement } from "../src/live-placement.js";
import { diagnostics as compiledLedger } from "../src/diagnostics.js";
import type { VideoJsPlayerLike } from "../src/types.js";

// Absent only in a prebuilt bundle; the tests run on the source.
if (!compiledLedger) throw new Error("diagnostics are compiled out");
const ledger = compiledLedger;
// The ledger decides once, at its first record: on, for the whole file.
debug.enable("p2pml:diagnostics");
ledger.snapshot();
debug.disable();

/** VHS's playlist controller: `goalBufferLength` lives on its prototype. */
class FakeController {
  readonly listeners = new Set<() => void>();
  readonly mainPlaylistLoader_ = {
    main: undefined as { suggestedPresentationDelay?: number } | undefined,
    on: (_: string, listener: () => void) => this.listeners.add(listener),
    off: (_: string, listener: () => void) => this.listeners.delete(listener),
  };

  goalBufferLength(): number {
    return 30;
  }

  /** VHS parses the manifest and announces it. */
  parsed(main: { suggestedPresentationDelay?: number } = {}) {
    this.mainPlaylistLoader_.main = main;
    for (const listener of [...this.listeners]) listener();
  }
}

function fakePlayer(controller: object | undefined) {
  return {
    tech: () => ({ el: () => null, vhs: { playlistController_: controller } }),
  } as unknown as VideoJsPlayerLike;
}

/** A live stream of 2 s segments over a window of `window` seconds. */
function live(window: number): ProcessedManifest {
  return {
    streams: [
      {
        key: "video",
        type: "main",
        isLive: true,
        start: 1000,
        end: 1000 + window,
        segmentCount: window / 2,
      },
    ],
  } as unknown as ProcessedManifest;
}

const vod = {
  streams: [{ key: "video", type: "main", isLive: false, start: 0, end: 600 }],
} as unknown as ProcessedManifest;

describe("Video.js live placement", () => {
  it("plays deep in the window and buffers a segment short of the delay", () => {
    // A 30 s window of 2 s segments: the delay a segment inside the tail, and
    // the buffer a segment short of it.
    const controller = new FakeController();
    const placement = new VhsLivePlacement(fakePlayer(controller));

    placement.update(live(30));
    controller.parsed();

    expect(
      controller.mainPlaylistLoader_.main?.suggestedPresentationDelay,
    ).toBe(28);
    expect(controller.goalBufferLength()).toBe(26);
    placement.release("destroyed");
  });

  it("writes the delay into a manifest VHS has already parsed", () => {
    const controller = new FakeController();
    controller.parsed();
    const placement = new VhsLivePlacement(fakePlayer(controller));

    placement.update(live(30));

    expect(
      controller.mainPlaylistLoader_.main?.suggestedPresentationDelay,
    ).toBe(28);
    placement.release("destroyed");
  });

  it("keeps the buffer a ceiling: a smaller goal of VHS's own stands", () => {
    const controller = new FakeController();
    controller.goalBufferLength = () => 10;
    const placement = new VhsLivePlacement(fakePlayer(controller));

    placement.update(live(30));
    expect(controller.goalBufferLength()).toBe(10);
    placement.release("destroyed");
  });

  it("gives back what it changed, and leaves what changed since", () => {
    const controller = new FakeController();
    const placement = new VhsLivePlacement(fakePlayer(controller));
    controller.parsed({ suggestedPresentationDelay: 6 });

    placement.update(live(30));
    expect(
      controller.mainPlaylistLoader_.main?.suggestedPresentationDelay,
    ).toBe(28);
    placement.release("destroyed");

    // The manifest's own delay, and VHS's own method from the prototype.
    expect(
      controller.mainPlaylistLoader_.main?.suggestedPresentationDelay,
    ).toBe(6);
    expect(Object.hasOwn(controller, "goalBufferLength")).toBe(false);
    expect(controller.goalBufferLength()).toBe(30);
    expect(controller.listeners.size).toBe(0);
  });

  it("follows a window that changes by half a segment or more", () => {
    const controller = new FakeController();
    const placement = new VhsLivePlacement(fakePlayer(controller));
    placement.update(live(30));
    controller.parsed();

    placement.update(live(30.5));
    controller.parsed(controller.mainPlaylistLoader_.main);
    expect(
      controller.mainPlaylistLoader_.main?.suggestedPresentationDelay,
    ).toBe(28);

    placement.update(live(40));
    expect(
      controller.mainPlaylistLoader_.main?.suggestedPresentationDelay,
    ).toBe(38);
    placement.release("destroyed");
  });

  it("moves to the controller of a new source, and lets go of a VOD one", () => {
    const first = new FakeController();
    const player = { tech: () => ({ vhs: { playlistController_: current } }) };
    let current: FakeController = first;
    const placement = new VhsLivePlacement(
      player as unknown as VideoJsPlayerLike,
    );
    placement.update(live(30));

    current = new FakeController();
    placement.update(live(30));
    expect(Object.hasOwn(first, "goalBufferLength")).toBe(false);
    expect(current.goalBufferLength()).toBe(26);

    placement.update(vod);
    expect(Object.hasOwn(current, "goalBufferLength")).toBe(false);
  });

  it("does nothing on a VHS without the internals it needs, and says so", () => {
    const before = ledger.snapshot()?.counters["VhsPlacement:unavailable"] ?? 0;
    const placement = new VhsLivePlacement(fakePlayer({}));

    placement.update(live(30));
    placement.update(live(30));

    expect(ledger.snapshot()?.counters["VhsPlacement:unavailable"]).toBe(
      before + 1,
    );
  });

  it("records its listener and ceiling, and closes both when released", () => {
    ledger.clearAnomalies();
    const before = ledger.snapshot();
    const controller = new FakeController();
    const placement = new VhsLivePlacement(fakePlayer(controller));

    placement.update(live(30));
    controller.parsed();
    const during = ledger.snapshot();
    expect(during?.live.VhsPlacementListener).toBe(
      (before?.live.VhsPlacementListener ?? 0) + 1,
    );
    expect(during?.live.VhsGoalBufferCeiling).toBe(
      (before?.live.VhsGoalBufferCeiling ?? 0) + 1,
    );
    expect(during?.counters["VhsPlacement:applied"]).toBe(
      (before?.counters["VhsPlacement:applied"] ?? 0) + 1,
    );

    placement.release("destroyed");
    const after = ledger.snapshot();
    expect(after?.live).toEqual(before?.live);
    expect(after?.anomalies).toEqual([]);
  });
});
