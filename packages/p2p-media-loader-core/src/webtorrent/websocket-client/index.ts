import { EventTarget } from "../../utils/event-target.js";

export type WebSocketClientEventMap = {
  connected: () => void;
  disconnected: () => void;
  reconnecting: () => void;
  error: (error: Event) => void;
  message: (data: ArrayBuffer | string) => void;
};

export type WebSocketClientState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "disposed";

export interface WebSocketClientConfig {
  url: string;
  initialDelay?: number;
  maxDelay?: number;
  jitterMultiplier?: number;
}

export class WebSocketClient {
  readonly #config: Required<WebSocketClientConfig>;

  #state: WebSocketClientState = "disconnected";
  #ws: WebSocket | null = null;
  #backoffCount = 0;
  #reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;

  readonly #eventTarget = new EventTarget<WebSocketClientEventMap>();

  constructor(config: WebSocketClientConfig) {
    const initialDelay = Math.max(100, config.initialDelay ?? 1000);

    this.#config = {
      url: config.url,
      initialDelay,
      // Ensure maxDelay is never less than initialDelay
      maxDelay: Math.max(initialDelay, config.maxDelay ?? 30000),
      jitterMultiplier: Math.max(0, config.jitterMultiplier ?? 0.2),
    };
  }

  public get state(): WebSocketClientState {
    return this.#state;
  }

  public addEventListener<K extends keyof WebSocketClientEventMap>(
    eventName: K,
    listener: WebSocketClientEventMap[K],
  ): void {
    this.#eventTarget.addEventListener(eventName, listener);
  }

  public removeEventListener<K extends keyof WebSocketClientEventMap>(
    eventName: K,
    listener: WebSocketClientEventMap[K],
  ): void {
    this.#eventTarget.removeEventListener(eventName, listener);
  }

  public connect(): void {
    if (
      this.#state === "connected" ||
      this.#state === "connecting" ||
      this.#state === "disposed"
    ) {
      return;
    }

    this.#state = "connecting";
    this.#clearReconnectTimeout();

    try {
      this.#ws = new WebSocket(this.#config.url);
      this.#ws.binaryType = "arraybuffer";

      this.#ws.onopen = this.#onOpen;
      this.#ws.onclose = this.#onClose;
      this.#ws.onerror = this.#onError;
      this.#ws.onmessage = this.#onMessage;
    } catch (error) {
      this.#state = "disconnected";
      const errorEvent = new ErrorEvent("error", {
        message:
          error instanceof Error
            ? error.message
            : "Unknown WebSocket creation error",
        error,
      });
      this.#eventTarget.dispatchEvent("error", errorEvent);
    }
  }

  public send(
    data: string | ArrayBuffer | Blob | ArrayBufferView<ArrayBuffer>,
  ): void {
    if (this.#state !== "connected" || !this.#ws) {
      throw new Error("WebSocketClient: Cannot send data when not connected");
    }
    this.#ws.send(data);
  }

  public dispose(): void {
    this.#state = "disposed";
    this.#clearReconnectTimeout();

    if (this.#ws) {
      this.#ws.onopen = null;
      this.#ws.onclose = null;
      this.#ws.onerror = null;
      this.#ws.onmessage = null;
      this.#ws.close();
      this.#ws = null;
    }
    this.#eventTarget.clear();
  }

  #onOpen = (): void => {
    if (this.#state === "disposed") return;
    this.#state = "connected";
    this.#backoffCount = 0;
    this.#eventTarget.dispatchEvent("connected");
  };

  #onClose = (): void => {
    if (this.#state === "disposed") return;
    if (this.#ws) {
      this.#ws.onopen = null;
      this.#ws.onclose = null;
      this.#ws.onerror = null;
      this.#ws.onmessage = null;
      this.#ws = null;
    }
    this.#scheduleReconnect();
    this.#eventTarget.dispatchEvent("disconnected");
  };

  #onError = (event: Event): void => {
    if (this.#state === "disposed") return;
    this.#eventTarget.dispatchEvent("error", event);
  };

  #onMessage = (event: MessageEvent<ArrayBuffer | string>): void => {
    if (this.#state === "disposed") return;
    this.#eventTarget.dispatchEvent("message", event.data);
  };

  #scheduleReconnect(): void {
    if (this.#state === "disposed") return;

    this.#state = "reconnecting";

    const baseDelay = Math.min(
      this.#config.initialDelay * Math.pow(2, this.#backoffCount),
      this.#config.maxDelay,
    );

    const jitter = baseDelay * this.#config.jitterMultiplier;
    const randomJitter = Math.random() * 2 * jitter - jitter;
    const delay = Math.max(0, baseDelay + randomJitter);

    if (baseDelay < this.#config.maxDelay) {
      this.#backoffCount++;
    }

    this.#reconnectTimeoutId = setTimeout(() => {
      if (this.#state !== "disposed") {
        this.connect();
      }
    }, delay);

    this.#eventTarget.dispatchEvent("reconnecting");
  }

  #clearReconnectTimeout(): void {
    if (this.#reconnectTimeoutId !== null) {
      clearTimeout(this.#reconnectTimeoutId);
      this.#reconnectTimeoutId = null;
    }
  }
}
