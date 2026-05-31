export class EventTarget<
  EventTypesMap extends Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a1?: any, a2?: any, a3?: any, a4?: any, a5?: any) => unknown
  >,
> {
  private events = new Map<
    keyof EventTypesMap,
    EventTypesMap[keyof EventTypesMap][]
  >();

  // We use hardcoded positional arguments (a1, a2, etc.) instead of TypeScript rest parameters
  // (...args) to avoid hidden array allocations during high-frequency event dispatching.
  // This ensures zero heap allocation for critical path events like onChunkDownloaded.
  //
  // IMPORTANT: Maximum supported arity is 5. If an event handler ever needs more than
  // 5 parameters, add additional positional arguments (a6, a7, ...) here AND in
  // getEventDispatcher below.
  public dispatchEvent<K extends keyof EventTypesMap>(
    eventName: K,
    ...args: Parameters<EventTypesMap[K]>
  ): void;
  public dispatchEvent<K extends keyof EventTypesMap>(
    eventName: K,
    a1?: unknown,
    a2?: unknown,
    a3?: unknown,
    a4?: unknown,
    a5?: unknown,
  ) {
    const listeners = this.events.get(eventName);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(a1, a2, a3, a4, a5);
      } catch {
        // Swallow user-land errors to protect internal invariants
      }
    }
  }

  public getEventDispatcher<K extends keyof EventTypesMap>(
    eventName: K,
  ): (...args: Parameters<EventTypesMap[K]>) => void;
  public getEventDispatcher<K extends keyof EventTypesMap>(eventName: K) {
    return (
      a1?: unknown,
      a2?: unknown,
      a3?: unknown,
      a4?: unknown,
      a5?: unknown,
    ) => {
      const listeners = this.events.get(eventName);
      if (!listeners) return;
      for (const listener of listeners) {
        try {
          listener(a1, a2, a3, a4, a5);
        } catch {
          // Swallow user-land errors to protect internal invariants
        }
      }
    };
  }

  public addEventListener<K extends keyof EventTypesMap>(
    eventName: K,
    listener: EventTypesMap[K],
  ) {
    const listeners = this.events.get(eventName);
    if (!listeners) {
      this.events.set(eventName, [listener]);
    } else {
      // Copy-on-write: we MUST create a new array here instead of mutating (e.g. push()).
      // dispatchEvent/getEventDispatcher iterate the array directly (no snapshot copy)
      // for zero-allocation dispatch. Creating a new array ensures any in-progress
      // iteration sees a stable reference and is not affected by concurrent additions.
      this.events.set(eventName, [...listeners, listener]);
    }
  }

  public removeEventListener<K extends keyof EventTypesMap>(
    eventName: K,
    listener: EventTypesMap[K],
  ) {
    const listeners = this.events.get(eventName);
    if (!listeners) return;

    const index = listeners.indexOf(listener);
    if (index === -1) return;

    if (listeners.length === 1) {
      this.events.delete(eventName);
      return;
    }

    // Copy-on-write: manually slice and splice to avoid closure allocation
    // and maintain stable references for in-progress iterations.
    const newListeners = listeners.slice();
    newListeners.splice(index, 1);
    this.events.set(eventName, newListeners);
  }

  public clear(): void {
    this.events.clear();
  }
}
