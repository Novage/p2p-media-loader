export class EventDispatcher<
  T extends { [key: string]: (...args: any) => any },
  K extends keyof T = keyof T
> {
  private readonly listeners = new Map<keyof T, Set<T[K]>>();

  subscribe(eventType: K, ...listeners: T[K][]) {
    let eventListeners = this.listeners.get(eventType);
    if (!eventListeners) {
      eventListeners = new Set();
      this.listeners.set(eventType, eventListeners);
    }
    for (const listener of listeners) eventListeners.add(listener);
  }

  unsubscribe(eventType: K, listener: T[K]) {
    const eventListeners = this.listeners.get(eventType);
    if (!eventListeners) return;
    eventListeners.delete(listener);
    if (!eventListeners.size) this.listeners.delete(eventType);
  }

  dispatch(eventType: K, ...args: Parameters<T[K]>) {
    const eventListeners = this.listeners.get(eventType);
    if (!eventListeners) return;
    for (const listener of eventListeners) {
      listener(args);
    }
  }
}
