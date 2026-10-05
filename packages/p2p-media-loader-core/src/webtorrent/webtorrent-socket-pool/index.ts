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

        entry.refCount--;

        if (entry.refCount <= 0) {
          if (entry.refCount < 0) {
            // eslint-disable-next-line no-console
            console.error(
              `[WebTorrentSocketPool] Negative refCount detected for ${url}`,
            );
          }
          const currentEntry = this.#sockets.get(url);
          if (currentEntry === entry) {
            this.#sockets.delete(url);
          }
          entry.client.dispose();
        }
      },
    };
  }

  /**
   * Closes every socket the pool holds, and leaves the pool usable. A core
   * resets itself between sources and keeps its pool, so what it subscribed to
   * once — its socket error log — has to outlast the reset; clearing the
   * listeners here silenced that log for every source after the first.
   * Loaders release their sockets before a core resets, so this normally finds
   * none; it closes whatever one failed to release.
   */
  public closeAllSockets(): void {
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
