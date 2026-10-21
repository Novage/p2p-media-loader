/**
 * Drives several demo tabs as one test: the release tests in
 * specs/release-testing.md. Loaded only by the dev server, and only with
 * `?driver=1` in the URL.
 *
 * Every tab with the driver listens on one `BroadcastChannel`. The tab that
 * runs a test sends code; every tab runs it and replies with the result, and
 * the sender collects one reply for each tab it expects. Running code another
 * tab sends is what makes one script able to test any number of tabs, and is
 * why this never leaves the dev server.
 */

type Snapshot = {
  live: Record<string, number>;
  open: string[];
  counters: Record<string, number>;
  probes: Record<string, unknown>;
  anomalies: string[];
};

type TabState = {
  me: string;
  rs: number | undefined;
  err: number | null;
  t: number | null;
  paused: boolean | undefined;
  /** Seconds behind the end of the seekable range. */
  lag: number | null;
  live?: Snapshot["live"];
  anomalies?: Snapshot["anomalies"];
  counters?: Snapshot["counters"];
  probes?: Snapshot["probes"];
  open?: Snapshot["open"];
};

type Message =
  | { reply: true; id: string; data: unknown }
  | { reply?: undefined; id: string; code: string; to?: string[] };

type BackgroundRun = {
  done: boolean;
  log: unknown[];
  result?: unknown;
  error?: string;
};

declare global {
  interface Window {
    __p2pmlDiagnostics?: {
      snapshot(): Snapshot;
      clearAnomalies(): void;
    };
    /** This tab's id among the driven tabs. */
    __me?: string;
    /** The driver's helpers; see `installTestDriver`. */
    __h: typeof helpers;
    /** Results of background runs, by name. */
    __R: Record<string, BackgroundRun>;
    /** Runs a long test inside the page; its results go to `__R[name]`. */
    __bg: (
      name: string,
      run: (log: (entry: unknown) => void) => Promise<unknown>,
    ) => string;
  }
}

const CHANNEL = "p2pml-test";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const video = () => document.querySelector("video");

/** Changes the demo's query parameters without a reload; the demo follows. */
function go(params: Record<string, string>) {
  const search = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(params)) search.set(key, value);
  history.pushState({}, "", `?${search.toString()}`);
  dispatchEvent(new PopStateEvent("popstate"));
}

/** Plays with sound at a low volume: Chrome pauses muted hidden video. */
function play() {
  const element = video();
  if (!element) return false;
  element.muted = false;
  element.volume = 0.02;
  element.play().catch(() => undefined);
  return true;
}

function state(): TabState {
  const element = video();
  const seekable = element?.seekable;
  const snapshot = window.__p2pmlDiagnostics?.snapshot();
  return {
    me: window.__me ?? "",
    rs: element?.readyState,
    err: element?.error?.code ?? null,
    t: element ? +element.currentTime.toFixed(1) : null,
    paused: element?.paused,
    lag:
      element && seekable?.length
        ? +(seekable.end(seekable.length - 1) - element.currentTime).toFixed(1)
        : null,
    live: snapshot?.live,
    anomalies: snapshot?.anomalies,
    counters: snapshot?.counters,
    probes: snapshot?.probes,
    open: snapshot?.open,
  };
}

/** Counter differences between two snapshots. */
function delta(
  after: Record<string, number> | undefined,
  before: Record<string, number> | undefined,
) {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(after ?? {})) {
    const previous = before?.[key] ?? 0;
    if (value !== previous) out[key] = value - previous;
  }
  return out;
}

/**
 * Compiles code another tab sent into an async function, so that it can use
 * `await`. Only the dev server ever loads this module.
 */
function compile(code: string) {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- runs test code from another driven tab
  return new Function(
    `return (async () => { ${code} })();`,
  ) as () => Promise<unknown>;
}

async function run(code: string): Promise<unknown> {
  try {
    return await compile(code)();
  } catch (error) {
    return { error: String(error) };
  }
}

const pending = new Map<
  string,
  { replies: unknown[]; expect: number; done: () => void }
>();
let channel: BroadcastChannel | undefined;

const newId = () => Math.random().toString(36).slice(2);

/**
 * Runs `code` in the other driven tabs, or in those `to` names, and resolves
 * with their replies: once `expect` have arrived, or after `ms`.
 */
function others(code: string, expect: number, ms = 15000, to?: string[]) {
  return new Promise<unknown[]>((resolve) => {
    const id = newId();
    const entry = {
      replies: [] as unknown[],
      expect,
      done: () => {
        if (!pending.delete(id)) return;
        resolve(entry.replies);
      },
    };
    pending.set(id, entry);
    channel?.postMessage({ id, code, to } satisfies Message);
    setTimeout(entry.done, ms);
  });
}

/** Runs `code` here and in `count - 1` other tabs; this tab replies first. */
async function all(code: string, count: number, ms?: number) {
  const [mine, theirs] = await Promise.all([
    run(code),
    others(code, count - 1, ms),
  ]);
  return [mine, ...theirs];
}

const helpers = { sleep, video, go, play, state, run, others, all, delta };

export function installTestDriver() {
  channel?.close();
  channel = new BroadcastChannel(CHANNEL);
  window.__me ??= newId().slice(0, 4);
  channel.onmessage = async (event: MessageEvent<Message>) => {
    const message = event.data;
    if (message.reply) {
      const entry = pending.get(message.id);
      if (!entry) return;
      entry.replies.push(message.data);
      if (entry.replies.length >= entry.expect) entry.done();
      return;
    }
    if (message.to && !message.to.includes(window.__me ?? "")) return;
    const data = await run(message.code);
    channel?.postMessage({
      reply: true,
      id: message.id,
      data,
    } satisfies Message);
  };
  window.__h = helpers;
  window.__R = {};
  window.__bg = (name, task) => {
    const entry: BackgroundRun = { done: false, log: [] };
    window.__R[name] = entry;
    void (async () => {
      try {
        entry.result = await task((item) => entry.log.push(item));
      } catch (error) {
        entry.error = String(error);
      }
      entry.done = true;
    })();
    return `started ${name}`;
  };
}
