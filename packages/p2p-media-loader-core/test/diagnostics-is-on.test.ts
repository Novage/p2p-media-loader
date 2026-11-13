import { expect, it } from "vitest";
import debug from "debug";
import { diagnostics } from "../src/diagnostics.js";

// A file of its own: the ledger decides once, at its first record, for the
// whole module.
it("asks whether the ledger records without deciding it", () => {
  if (!diagnostics) throw new Error("diagnostics are compiled out");
  debug.disable();
  expect(diagnostics.isOn()).toBe(false);

  // Enabled after the question and before any record: the record decides.
  debug.enable("p2pml:diagnostics");
  expect(diagnostics.isOn()).toBe(true);
  diagnostics.count("Test:recorded");
  expect(diagnostics.snapshot()?.counters["Test:recorded"]).toBe(1);
});
