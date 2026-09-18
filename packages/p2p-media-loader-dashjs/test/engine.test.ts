import { describe, expect, it, vi } from "vitest";
import type { MediaPlayerClass } from "dashjs";
import { DashJsP2PEngine } from "../src/engine.js";

function fakePlayer(
  liveDelay: number | undefined,
  liveDelayFragmentCount: number = NaN,
) {
  const settings = {
    streaming: { delay: { liveDelay, liveDelayFragmentCount } },
  };
  const player = {
    getSettings: vi.fn(() => settings),
    updateSettings: vi.fn((update: { streaming?: { delay?: object } }) => {
      Object.assign(settings.streaming.delay, update.streaming?.delay);
    }),
    extend: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getVideoElement: vi.fn(() => {
      throw new Error("ELEMENT_NOT_ATTACHED_ERROR");
    }),
  };
  return { player: player as unknown as MediaPlayerClass, spies: player };
}

describe("DashJsP2PEngine.bindPlayer", () => {
  it("replaces the player's XHRLoader through extend, overriding the original", () => {
    const { player, spies } = fakePlayer(NaN);
    const engine = new DashJsP2PEngine();
    engine.bindPlayer(player);
    expect(spies.extend).toHaveBeenCalledTimes(1);
    const [name, extension, override] = spies.extend.mock.calls[0] as [
      string,
      unknown,
      boolean,
    ];
    expect(name).toBe("XHRLoader");
    expect(typeof extension).toBe("function");
    expect(override).toBe(true);
    engine.destroy();
  });

  it("takes over the live delay only where the integrator left dash.js's default", () => {
    const managed = fakePlayer(NaN);
    new DashJsP2PEngine().bindPlayer(managed.player);
    expect(managed.spies.updateSettings).toHaveBeenCalledWith({
      streaming: {
        delay: { liveDelay: 25, useSuggestedPresentationDelay: false },
      },
    });

    const configured = fakePlayer(8);
    new DashJsP2PEngine().bindPlayer(configured.player);
    expect(configured.spies.updateSettings).not.toHaveBeenCalled();
  });

  it("leaves a player placed by fragment count alone as well", () => {
    // dash.js reads liveDelayFragmentCount when liveDelay has no value, so an
    // integrator who set it has placed the player just as deliberately.
    const byFragmentCount = fakePlayer(NaN, 3);
    new DashJsP2PEngine().bindPlayer(byFragmentCount.player);
    expect(byFragmentCount.spies.updateSettings).not.toHaveBeenCalled();

    // A null is dash.js's other way of saying unset.
    const unset = fakePlayer(NaN, null as unknown as number);
    new DashJsP2PEngine().bindPlayer(unset.player);
    expect(unset.spies.updateSettings).toHaveBeenCalled();
  });

  it("subscribes to stream lifecycle events and unsubscribes on destroy", () => {
    const { player, spies } = fakePlayer(NaN);
    const engine = new DashJsP2PEngine();
    engine.bindPlayer(player);
    expect(spies.on.mock.calls.map((c) => c[0])).toEqual([
      "streamInitialized",
      "streamTeardownComplete",
    ]);
    engine.destroy();
    expect(spies.off.mock.calls.map((c) => c[0])).toEqual([
      "streamInitialized",
      "streamTeardownComplete",
    ]);
  });
});
