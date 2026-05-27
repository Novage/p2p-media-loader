class AbortSignalPolyfill {
  aborted = false;
  readonly #listeners = new Set<(event?: unknown) => void>();

  addEventListener(_type: "abort", listener: (event?: unknown) => void) {
    this.#listeners.add(listener);
  }

  removeEventListener(_type: "abort", listener: (event?: unknown) => void) {
    this.#listeners.delete(listener);
  }

  dispatchEvent(_type: "abort") {
    this.aborted = true;
    for (const listener of this.#listeners) {
      try {
        listener();
      } catch {
        // Swallow listener errors
      }
    }
    this.#listeners.clear();
  }
}

class AbortControllerPolyfill {
  readonly signal = new AbortSignalPolyfill();

  abort() {
    this.signal.dispatchEvent("abort");
  }
}

export const isAbortControllerSupported =
  typeof AbortController !== "undefined";

export const SafeAbortController = isAbortControllerSupported
  ? AbortController
  : AbortControllerPolyfill;

export type SafeAbortSignal = AbortSignal | AbortSignalPolyfill;
