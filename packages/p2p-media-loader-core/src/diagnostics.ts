import debug from "debug";

/**
 * The ledger that tests read: the resources open now, the counters of
 * results, the probes of values that can drift, and the anomalies. Off unless
 * the `p2pml:diagnostics` debug namespace is enabled; when off, every call
 * returns at once and nothing is kept. See specs/diagnostics.md.
 */
const NAMESPACE = "p2pml:diagnostics";

/**
 * Replaced with `false` in the prebuilt bundles (`vite.common.config.ts`),
 * which then carry no ledger at all; absent everywhere else, the `tsc` output
 * in `lib/` included, where the ledger stays. See specs/diagnostics.md.
 */
declare const __P2PML_DIAGNOSTICS__: boolean | undefined;
const COMPILED_IN =
  typeof __P2PML_DIAGNOSTICS__ === "undefined" || __P2PML_DIAGNOSTICS__;

/** Identifies one open resource; the owner gives it back to `close`. */
export type DiagnosticsToken = string;

/** The ledger's state at one moment, as a reader sees it. */
export type DiagnosticsSnapshot = {
  /** Open resources, by kind. Kinds with none open are left out. */
  readonly live: Readonly<Record<string, number>>;
  /** Each open resource: its token and detail. */
  readonly open: readonly string[];
  readonly counters: Readonly<Record<string, number>>;
  /** Each probe's value, read for this snapshot. */
  readonly probes: Readonly<Record<string, unknown>>;
  readonly anomalies: readonly string[];
};

type Ledger = {
  readonly live: Map<string, number>;
  readonly open: Map<DiagnosticsToken, { kind: string; detail: string }>;
  readonly counters: Map<string, number>;
  readonly probes: Map<string, () => unknown>;
  readonly anomalies: string[];
  sequence: number;
  readonly log: debug.Debugger;
};

/** `undefined` until the first record decides; `null` when off. */
let ledger: Ledger | null | undefined;

function active(): Ledger | null {
  if (ledger !== undefined) return ledger;
  if (!debug.enabled(NAMESPACE)) return (ledger = null);
  ledger = {
    live: new Map(),
    open: new Map(),
    counters: new Map(),
    probes: new Map(),
    anomalies: [],
    sequence: 0,
    log: debug(NAMESPACE),
  };
  (globalThis as { __p2pmlDiagnostics?: unknown }).__p2pmlDiagnostics = {
    snapshot: () => ledgerApi.snapshot(),
    clearAnomalies: () => ledgerApi.clearAnomalies(),
  };
  return ledger;
}

function recordAnomaly(state: Ledger, message: string): void {
  state.anomalies.push(message);
  state.log("ANOMALY %s", message);
}

const ledgerApi = {
  /**
   * Records a resource its owner now holds. Returns the token to close it
   * with, or `undefined` when diagnostics are off.
   *
   * @param kind - What is held, in PascalCase: `Peer`, `TrackerSocket`.
   * @param detail - A short id, or a string that exists already.
   */
  open(kind: string, detail = ""): DiagnosticsToken | undefined {
    const state = active();
    if (!state) return undefined;
    const token = `${kind}#${++state.sequence}`;
    state.open.set(token, { kind, detail });
    const live = (state.live.get(kind) ?? 0) + 1;
    state.live.set(kind, live);
    state.log("open  %s %s (live %d)", token, detail, live);
    return token;
  },

  /**
   * Records the release of a resource. A token that is not open, or no token
   * at all, is a release of something never held or held no longer, and is
   * recorded as an anomaly.
   *
   * @param cause - Why it was released: `destroyed`, `fired`, `failed`.
   */
  close(token: DiagnosticsToken | undefined, cause: string): void {
    const state = active();
    if (!state) return;
    const entry = token === undefined ? undefined : state.open.get(token);
    if (!token || !entry) {
      recordAnomaly(
        state,
        `closed ${token ?? "with no token"} (${cause}): not open`,
      );
      return;
    }
    state.open.delete(token);
    const live = (state.live.get(entry.kind) ?? 1) - 1;
    if (live === 0) state.live.delete(entry.kind);
    else state.live.set(entry.kind, live);
    state.log("close %s %s (live %d)", token, cause, live);
  },

  /** Adds to a counter: `Area:qualifier:result`, from fixed words only. */
  count(name: string, by = 1): void {
    const state = active();
    if (!state) return;
    state.counters.set(name, (state.counters.get(name) ?? 0) + by);
  },

  /**
   * Registers a value to read at each snapshot. Returns the function that
   * removes it; a later probe of the same name is not removed by it.
   */
  probe(name: string, read: () => unknown): () => void {
    const state = active();
    if (!state) return noop;
    state.probes.set(name, read);
    return () => {
      if (state.probes.get(name) === read) state.probes.delete(name);
    };
  },

  /** Records a state that must not occur. */
  anomaly(message: string): void {
    const state = active();
    if (state) recordAnomaly(state, message);
  },

  /** The ledger now, or `undefined` when diagnostics are off. */
  snapshot(): DiagnosticsSnapshot | undefined {
    const state = active();
    if (!state) return undefined;
    const probes: Record<string, unknown> = {};
    for (const [name, read] of state.probes) {
      try {
        probes[name] = read();
      } catch (error) {
        probes[name] = `probe failed: ${String(error)}`;
      }
    }
    return {
      live: toRecord(state.live),
      open: Array.from(state.open, ([token, { detail }]) =>
        detail ? `${token} ${detail}` : token,
      ),
      counters: toRecord(state.counters),
      probes,
      anomalies: [...state.anomalies],
    };
  },

  /** Forgets the anomalies, so that one test step is not read as the next. */
  clearAnomalies(): void {
    const state = active();
    if (state) state.anomalies.length = 0;
  },
};

/** The ledger's calls; see `diagnostics`. */
export type Diagnostics = typeof ledgerApi;

/**
 * The ledger, or `undefined` in a prebuilt bundle, which carries none. Every
 * call is `diagnostics?.open(…)`, so that where it is compiled out the
 * minifier removes the call and its arguments along with it.
 *
 * @internal Not part of the public API: its kinds and names change with the
 * code they describe.
 */
export const diagnostics: Diagnostics | undefined = COMPILED_IN
  ? ledgerApi
  : undefined;

function toRecord(map: ReadonlyMap<string, number>): Record<string, number> {
  const record: Record<string, number> = {};
  for (const [key, value] of map) record[key] = value;
  return record;
}

function noop(): void {
  // A probe registered while diagnostics are off has nothing to remove.
}
