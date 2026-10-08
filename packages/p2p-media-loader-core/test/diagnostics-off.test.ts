import { describe, expect, it } from "vitest";
import { diagnostics as compiledLedger } from "../src/diagnostics.js";

// Absent only in a prebuilt bundle; the tests run on the source.
if (!compiledLedger) throw new Error("diagnostics are compiled out");
const diagnostics = compiledLedger;

describe("diagnostics, when off", () => {
  it("keeps nothing and installs nothing", () => {
    const token = diagnostics.open("Thing");
    diagnostics.count("Area:qualifier:result");
    diagnostics.anomaly("not recorded");
    diagnostics.close(token, "done");
    diagnostics.close(undefined, "not an anomaly when off");

    expect(token).toBeUndefined();
    expect(diagnostics.snapshot()).toBeUndefined();
    expect(globalThis).not.toHaveProperty("__p2pmlDiagnostics");
  });

  it("never reads a probe", () => {
    let reads = 0;
    const remove = diagnostics.probe("Value", () => ++reads);
    diagnostics.snapshot();
    remove();
    expect(reads).toBe(0);
  });
});
