import { WebSocketClient } from "../websocket-client/index.js";
import { EventTarget } from "../../utils/event-target.js";

export type WebTorrentSocketPoolEventMap = {
  error: (error: Event, url: string) => void;
};

type PoolEntry = {
  client: WebSocketClient;
  refCount: number;
};

export class WebTorrentSocketPool {
  readonly #sockets = new Map<string, PoolEntry>();
  readonly #eventTarget = new EventTarget<WebTorrentSocketPoolEventMap>();

  public addEventListener<K extends keyof WebTorrentSocketPoolEventMap>(
    eventName: K,
    listener: WebTorrentSocketPoolEventMap[K],
  ): void {
    this.#eventTarget.addEventListener(eventName, listener);
  }

  public removeEventListener<K extends keyof WebTorrentSocketPoolEventMap>(
    eventName: K,
    listener: WebTorrentSocketPoolEventMap[K],
  ): void {
    this.#eventTarget.removeEventListener(eventName, listener);
  }

  public acquire(url: string): {
    client: WebSocketClient;
    release: () => void;
  } {
    let entry = this.#sockets.get(url);

    if (!entry) {
      const client = new WebSocketClient({ url });
      client.addEventListener("error", (error) => {
        this.#eventTarget.dispatchEvent("error", error, url);
      });
      client.connect();
      entry = { client, refCount: 0 };
      this.#sockets.set(url, entry);
    }

    entry.refCount++;

    let isReleased = false;

    return {
      client: entry.client,
      release: () => {
        if (isReleased) return;
        isReleased = true;

        // Ensure we are decrementing the current entry in the map
        const currentEntry = this.#sockets.get(url);
        if (!currentEntry) return;

        currentEntry.refCount--;

        if (currentEntry.refCount <= 0) {
          if (currentEntry.refCount < 0) {
            // eslint-disable-next-line no-console
            console.error(
              `[WebTorrentSocketPool] Negative refCount detected for ${url}`,
            );
          }
          this.#sockets.delete(url);
          currentEntry.client.dispose();
        }
      },
    };
  }

  public destroy(): void {
    this.#eventTarget.clear();
    const entries = Array.from(this.#sockets.values());
    this.#sockets.clear();
    for (const entry of entries) {
      try {
        entry.client.dispose();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
          "[WebTorrentSocketPool] Failed to dispose WebSocketClient:",
          error,
        );
      }
    }
  }
}
