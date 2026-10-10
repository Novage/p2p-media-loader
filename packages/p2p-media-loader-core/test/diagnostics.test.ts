import { describe, expect, it } from "vitest";
import debug from "debug";
import {
  diagnostics as compiledLedger,
  type DiagnosticsSnapshot,
} from "../src/diagnostics.js";

// Absent only in a prebuilt bundle; the tests run on the source.
if (!compiledLedger) throw new Error("diagnostics are compiled out");
const diagnostics = compiledLedger;

// The ledger decides once, at its first record. Turning the namespace off
// again after that keeps the ledger on and the anomalies these tests cause
// out of the output.
debug.enable("p2pml:diagnostics");
diagnostics.snapshot();
debug.disable();

function snapshot(): DiagnosticsSnapshot {
  const taken = diagnostics.snapshot();
  if (!taken) throw new Error("diagnostics are off");
  return taken;
}

describe("diagnostics, when on", () => {
  it("counts open resources by kind until they close", () => {
    const first = diagnostics.open("Thing", "one");
    const second = diagnostics.open("Thing");
    expect(first).toMatch(/^Thing#\d+$/);
    expect(second).not.toBe(first);
    expect(snapshot().live.Thing).toBe(2);
    expect(snapshot().open).toContain(`${first} one`);

    diagnostics.close(first, "done");
    diagnostics.close(second, "done");
    expect(snapshot().live.Thing).toBeUndefined();
    expect(snapshot().anomalies).toEqual([]);
  });

  it("records a double close and a close with no token as anomalies", () => {
    diagnostics.clearAnomalies();
    const token = diagnostics.open("Thing");
    diagnostics.close(token, "done");
    diagnostics.close(token, "again");
    diagnostics.close(undefined, "never opened");

    const { anomalies } = snapshot();
    expect(anomalies).toHaveLength(2);
    expect(anomalies[0]).toContain(`${token} (again)`);
    expect(anomalies[1]).toContain("with no token (never opened)");

    diagnostics.clearAnomalies();
    expect(snapshot().anomalies).toEqual([]);
  });

  it("adds to counters, which a snapshot does not reset", () => {
    diagnostics.count("Area:qualifier:result");
    diagnostics.count("Area:qualifier:result", 2);
    expect(snapshot().counters["Area:qualifier:result"]).toBe(3);
    expect(snapshot().counters["Area:qualifier:result"]).toBe(3);
  });

  it("reads probes at each snapshot, and survives one that throws", () => {
    let value = 1;
    const removeValue = diagnostics.probe("Value", () => value);
    const removeBroken = diagnostics.probe("Broken", () => {
      throw new Error("no reading");
    });
    expect(snapshot().probes.Value).toBe(1);
    value = 2;
    expect(snapshot().probes.Value).toBe(2);
    expect(snapshot().probes.Broken).toMatch(/probe failed/);

    removeValue();
    removeBroken();
    expect(snapshot().probes).not.toHaveProperty("Value");
    expect(snapshot().probes).not.toHaveProperty("Broken");
  });

  it("does not let an old removal take a newer probe of the same name", () => {
    const removeOld = diagnostics.probe("Shared", () => "old");
    const removeNew = diagnostics.probe("Shared", () => "new");
    removeOld();
    expect(snapshot().probes.Shared).toBe("new");
    removeNew();
  });

  it("is readable from the page", () => {
    const reader = (
      globalThis as {
        __p2pmlDiagnostics?: { snapshot: () => DiagnosticsSnapshot };
      }
    ).__p2pmlDiagnostics;
    expect(reader?.snapshot().counters).toEqual(snapshot().counters);
  });
});
