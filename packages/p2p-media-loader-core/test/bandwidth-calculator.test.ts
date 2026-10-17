import { describe, expect, it } from "vitest";
import debug from "debug";
import { BandwidthCalculator } from "../src/bandwidth-calculator.js";
import { Request as SegmentRequest } from "../src/requests/request.js";
import { EventTarget } from "../src/utils/event-target.js";
import { Core } from "../src/core.js";
import { hlsManifestParser } from "../src/hls.js";
import { RequestError, type CoreEventMap } from "../src/types.js";
import type {
  BandwidthCalculators,
  SegmentWithStream,
  StreamWithSegments,
} from "../src/internal-types.js";
import { diagnostics as compiledLedger } from "../src/diagnostics.js";
import { HLS_LIVE_NO_PDT_REFRESH_1 } from "./fixtures/index.js";

// Absent only in a prebuilt bundle; the tests run on the source.
if (!compiledLedger) throw new Error("diagnostics are compiled out");
const ledger = compiledLedger;
// The ledger decides once, at its first record: on, for the whole file.
debug.enable("p2pml:diagnostics");
ledger.snapshot();
debug.disable();

const MB = 1_000_000;

describe("BandwidthCalculator", () => {
  it("counts the wait for the response: one burst after two seconds is not gigabits", () => {
    const calculator = new BandwidthCalculator();
    const download = calculator.startLoading(0);
    calculator.addBytes(download, 250_000);
    calculator.stopLoading(download, 2000);

    expect(calculator.getBandwidthLoadingOnly(5, 2000)).toBe(1_000_000);
  });

  it("measures downloads that run side by side by their total, in a short window too", () => {
    // Both deliver everything at the end, a few milliseconds apart. Two
    // megabytes in two seconds, whichever second the window looks at.
    const calculator = new BandwidthCalculator();
    const a = calculator.startLoading(0);
    const b = calculator.startLoading(5);
    calculator.addBytes(a, MB);
    calculator.stopLoading(a, 2000);
    calculator.addBytes(b, MB);
    calculator.stopLoading(b, 2005);

    const truth = (2 * MB * 8000) / 2005;
    expect(calculator.getBandwidthLoadingOnly(1, 2005)).toBeCloseTo(truth, -4);
    expect(calculator.getBandwidthLoadingOnly(5, 2005)).toBeCloseTo(truth, -4);
  });

  it("leaves idle time out of the loading-only rate, and keeps it in the wall-clock one", () => {
    const calculator = new BandwidthCalculator();
    const first = calculator.startLoading(0);
    calculator.addBytes(first, MB);
    calculator.stopLoading(first, 1000);
    const second = calculator.startLoading(5000);
    calculator.addBytes(second, MB);
    calculator.stopLoading(second, 6000);

    expect(calculator.getBandwidthLoadingOnly(5, 6000)).toBe(8 * MB);
    expect(calculator.getBandwidth(10, undefined, 6000)).toBeCloseTo(
      (2 * MB * 8000) / 6000,
    );
  });

  it("counts a download under way by its bytes so far over its time so far", () => {
    const calculator = new BandwidthCalculator();
    const download = calculator.startLoading(0);
    calculator.addBytes(download, 500_000);

    expect(calculator.getBandwidthLoadingOnly(5, 1000)).toBe(4 * MB);
    // Still waiting for more: the rate falls as the time goes by.
    expect(calculator.getBandwidthLoadingOnly(5, 2000)).toBe(2 * MB);
  });

  it("counts only what came after the threshold", () => {
    const calculator = new BandwidthCalculator();
    const download = calculator.startLoading(0);
    calculator.addBytes(download, MB);
    calculator.stopLoading(download, 2000);

    expect(calculator.getBandwidth(30, 1000, 2000)).toBe(4 * MB);
  });

  it("reports bytes or a stop for a download that is not loading", () => {
    ledger.clearAnomalies();
    const calculator = new BandwidthCalculator();
    const download = calculator.startLoading(0);
    calculator.stopLoading(download, 100);
    calculator.addBytes(download, MB);
    calculator.stopLoading(download, 200);

    expect(calculator.loadingCount).toBe(0);
    expect(calculator.getBandwidthLoadingOnly(5, 200)).toBe(0);
    expect(ledger.snapshot()?.anomalies).toEqual([
      "BandwidthCalculator bytes for a download not loading",
      "BandwidthCalculator stop for a download not loading",
    ]);
    ledger.clearAnomalies();
  });

  it("takes what its owner still reports of a download it cleared, quietly", () => {
    // A peer stops its download and clears its history after a failure; an
    // owner that reports after the clear is not out of order.
    ledger.clearAnomalies();
    const calculator = new BandwidthCalculator();
    const cleared = calculator.startLoading(300);
    calculator.clear();
    calculator.addBytes(cleared, MB);
    calculator.stopLoading(cleared, 400);

    expect(calculator.loadingCount).toBe(0);
    expect(calculator.getBandwidthLoadingOnly(5, 400)).toBe(0);
    expect(ledger.snapshot()?.anomalies).toEqual([]);
  });

  it("drops downloads that ended before any window reaches", () => {
    const calculator = new BandwidthCalculator(1000);
    const old = calculator.startLoading(0);
    calculator.addBytes(old, MB);
    calculator.stopLoading(old, 1000);
    const later = calculator.startLoading(1000);
    calculator.stopLoading(later, 2500);
    expect(calculator.getBandwidthLoadingOnly(10, 2500)).toBeGreaterThan(0);

    // More than a second of loading since the old download ended.
    calculator.startLoading(2500);
    expect(calculator.getBandwidthLoadingOnly(10, 2500)).toBe(0);
  });
});

describe("A request's downloads in the shared calculators", () => {
  const segment = {
    runtimeId: "seg-0",
    externalId: 0,
    url: "https://cdn.example/v/720p/0.ts",
    startTime: 0,
    endTime: 4,
    stream: {
      type: "main",
      swarmId: "https://cdn.example/v/master.m3u8",
      streamSwarmId: "v3-swarm-main-id",
      segments: new Map(),
    } as unknown as StreamWithSegments,
  } as SegmentWithStream;

  function startHttp() {
    const calculators = {
      all: new BandwidthCalculator(),
      http: new BandwidthCalculator(),
    };
    const request = new SegmentRequest(
      segment,
      () => undefined,
      calculators,
      new EventTarget<CoreEventMap>(),
      "infohash",
    );
    const controls = request.start(
      { downloadSource: "http" },
      { onAbort: () => undefined },
    );
    expect(calculators.all.loadingCount).toBe(1);
    expect(calculators.http.loadingCount).toBe(1);
    return { request, controls, calculators };
  }

  const loading = ({ all, http }: BandwidthCalculators) => [
    all.loadingCount,
    http.loadingCount,
  ];

  it("stop when the attempt succeeds, fails, or is cancelled", () => {
    const succeeded = startHttp();
    succeeded.controls.addLoadedChunk(new Uint8Array(1000));
    succeeded.controls.completeOnSuccess();
    expect(loading(succeeded.calculators)).toEqual([0, 0]);

    const failed = startHttp();
    failed.controls.failWithError(new RequestError("http-error"));
    expect(loading(failed.calculators)).toEqual([0, 0]);

    const cancelled = startHttp();
    cancelled.request.cancel();
    expect(loading(cancelled.calculators)).toEqual([0, 0]);
  });

  it("are probed for as long as the core plays one source", () => {
    const probes = () =>
      Object.entries(ledger.snapshot()?.probes ?? {}).filter(([name]) =>
        name.startsWith("BandwidthLoading#"),
      );
    const before = new Set(probes().map(([name]) => name));
    const core = new Core({ manifestParsers: [hlsManifestParser] });
    core.processManifest({
      url: "https://cdn.example/live/index.m3u8",
      data: HLS_LIVE_NO_PDT_REFRESH_1,
    });
    const { all, http } = (
      core as unknown as { bandwidthCalculators: BandwidthCalculators }
    ).bandwidthCalculators;
    const ownProbe = () => probes().find(([name]) => !before.has(name))?.[1];

    const download = { all: all.startLoading(), http: http.startLoading() };
    expect(ownProbe()).toEqual({ all: 1, http: 1 });
    all.stopLoading(download.all);
    http.stopLoading(download.http);
    expect(ownProbe()).toEqual({ all: 0, http: 0 });

    core.destroy();
    expect(ownProbe()).toBeUndefined();
  });

  it("left loading are reported when the core is destroyed", () => {
    ledger.clearAnomalies();
    const core = new Core({ manifestParsers: [hlsManifestParser] });
    const { all } = (
      core as unknown as { bandwidthCalculators: BandwidthCalculators }
    ).bandwidthCalculators;
    all.startLoading();

    core.destroy();

    expect(ledger.snapshot()?.anomalies).toEqual([
      "BandwidthCalculator:all loading after destroy",
    ]);
    ledger.clearAnomalies();
  });
});
