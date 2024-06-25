export class EventTarget<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  EventTypesMap extends { [key: string]: (...args: any[]) => unknown },
> {
  private events = new Map<
    keyof EventTypesMap,
    EventTypesMap[keyof EventTypesMap][]
  >();

  public dispatchEvent<K extends keyof EventTypesMap>(
    eventName: K,
    ...args: Parameters<EventTypesMap[K]>
  ) {
    const listeners = this.events.get(eventName);
    if (!listeners) return;
    for (const listener of listeners) {
      listener(...args);
    }
  }

  public getEventDispatcher<K extends keyof EventTypesMap>(eventName: K) {
    let listeners = this.events.get(eventName);
    if (!listeners) {
      listeners = [];
      this.events.set(eventName, listeners);
    }

    const definedListeners = listeners;

    return (...args: Parameters<EventTypesMap[K]>) => {
      for (const listener of definedListeners) {
        listener(...args);
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
      listeners.push(listener);
    }
  }

  public removeEventListener<K extends keyof EventTypesMap>(
    eventName: K,
    listener: EventTypesMap[K],
  ) {
    const listeners = this.events.get(eventName);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }
}
