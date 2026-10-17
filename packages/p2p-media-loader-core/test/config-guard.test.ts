import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import debug from "debug";
import { Core } from "../src/core.js";
import { diagnostics as compiledLedger } from "../src/diagnostics.js";
import type { CoreConfig, DynamicCoreConfig } from "../src/types.js";

describe("swarm identity config", () => {
  it("passes streamSwarmIdBuilder from the constructor config to both streams", () => {
    const builder = () => "key";
    const core = new Core({ streamSwarmIdBuilder: builder });

    const config = core.getConfig();
    expect(config.mainStream.streamSwarmIdBuilder).toBe(builder);
    expect(config.secondaryStream.streamSwarmIdBuilder).toBe(builder);
  });

  it("passes per-stream streamSwarmIdBuilder from the constructor config", () => {
    const mainBuilder = () => "main-key";
    const secondaryBuilder = () => "secondary-key";
    const core = new Core({
      mainStream: { streamSwarmIdBuilder: mainBuilder },
      secondaryStream: { streamSwarmIdBuilder: secondaryBuilder },
    });

    const config = core.getConfig();
    expect(config.mainStream.streamSwarmIdBuilder).toBe(mainBuilder);
    expect(config.secondaryStream.streamSwarmIdBuilder).toBe(secondaryBuilder);
  });

  it("ignores swarmId and streamSwarmIdBuilder in dynamic config updates", () => {
    const builder = () => "key";
    const core = new Core({
      swarmId: "initial-swarm",
      streamSwarmIdBuilder: builder,
    });

    // Plain-JS callers can pass properties excluded from DynamicCoreConfig.
    core.applyDynamicConfig({
      urgentBufferThreshold: 30,
      mainStream: {
        swarmId: "hijacked-swarm",
        streamSwarmIdBuilder: () => "hijacked-key",
        p2pDownloadTimeWindow: 9000,
      },
      swarmId: "hijacked-swarm",
      streamSwarmIdBuilder: () => "hijacked-key",
    } as DynamicCoreConfig);

    const config = core.getConfig();
    // Static-only properties are untouched...
    expect(config.mainStream.swarmId).toBe("initial-swarm");
    expect(config.mainStream.streamSwarmIdBuilder).toBe(builder);
    expect(config.secondaryStream.swarmId).toBe("initial-swarm");
    expect(config.secondaryStream.streamSwarmIdBuilder).toBe(builder);
    // ...while sibling dynamic properties still apply.
    expect(config.mainStream.urgentBufferThreshold).toBe(30);
    expect(config.mainStream.p2pDownloadTimeWindow).toBe(9000);
  });
});

describe("renamed config keys", () => {
  // The ledger decides once, at its first record: on, for the whole file.
  debug.enable("p2pml:diagnostics");
  compiledLedger?.snapshot();
  debug.disable();
  const count = () =>
    compiledLedger?.snapshot()?.counters["Config:renamed-key"] ?? 0;

  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    warn.mockRestore();
  });

  // A plain-JavaScript caller, or a config object that is not a literal:
  // TypeScript cannot reject the old key there.
  const withOldKey = (config: object) => config as Partial<CoreConfig>;

  it.each([
    ["the top level", { highDemandTimeWindow: 6 }],
    ["mainStream", { mainStream: { highDemandTimeWindow: 6 } }],
    ["secondaryStream", { secondaryStream: { highDemandTimeWindow: 6 } }],
  ])("warns once for highDemandTimeWindow at %s", (_level, config) => {
    const before = count();
    const core = new Core(withOldKey(config));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("urgentBufferThreshold");
    expect(count()).toBe(before + 1);
    // Never carried over: its meaning changed.
    expect(core.getConfig().mainStream.urgentBufferThreshold).toBeUndefined();
  });

  it("warns once for each core, also when a dynamic config names it again", () => {
    const core = new Core(withOldKey({ highDemandTimeWindow: 6 }));
    core.applyDynamicConfig(
      withOldKey({ highDemandTimeWindow: 8 }) as DynamicCoreConfig,
    );
    expect(warn).toHaveBeenCalledTimes(1);

    new Core(withOldKey({ highDemandTimeWindow: 6 }));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("warns when only a dynamic config names it", () => {
    const core = new Core();
    core.applyDynamicConfig(
      withOldKey({
        mainStream: { highDemandTimeWindow: 8 },
      }) as DynamicCoreConfig,
    );
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("stays silent for a config without it", () => {
    const core = new Core({ urgentBufferThreshold: 6 });
    core.applyDynamicConfig({ urgentBufferThreshold: 8 });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("removed config keys", () => {
  debug.enable("p2pml:diagnostics");
  compiledLedger?.snapshot();
  debug.disable();
  const count = () =>
    compiledLedger?.snapshot()?.counters["Config:removed-key"] ?? 0;

  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it("warns once for validateHTTPSegment, and says what replaces it", () => {
    const before = count();
    const core = new Core({
      validateHTTPSegment: () => Promise.resolve(true),
    } as Partial<CoreConfig>);
    core.applyDynamicConfig({
      mainStream: { validateHTTPSegment: () => Promise.resolve(true) },
    } as DynamicCoreConfig);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("validateP2PSegment");
    expect(count()).toBe(before + 1);
  });
});
