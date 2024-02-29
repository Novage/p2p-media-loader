export class EventEmitter<
  T extends Record<K, (...args: unknown[]) => never>,
  K extends string = string,
> {
  private events: Map<K, ((...args: unknown[]) => never)[]> = new Map();

  dispatchEvent(eventName: K, ...args: Parameters<T[K]>) {
    const listeners = this.events.get(eventName);
    if (!listeners) return;

    for (const listener of listeners) {
      listener(...args);
    }
  }

  addEventListener(eventName: K, listener: T[K]) {
    const listeners = this.events.get(eventName);
    if (!listeners) {
      this.events.set(eventName, [listener]);
    } else {
      listeners.push(listener);
    }
  }

  removeEventListener(eventName: K, listener: T[K]) {
    const listeners = this.events.get(eventName);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }
}
