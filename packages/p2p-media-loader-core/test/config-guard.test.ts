import { describe, expect, it } from "vitest";
import { Core } from "../src/core.js";
import { DynamicCoreConfig } from "../src/types.js";

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
