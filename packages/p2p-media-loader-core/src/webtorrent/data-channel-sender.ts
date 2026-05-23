import { getPromiseWithResolvers } from "../utils/utils.js";
import { getRTCErrorMessage } from "./utils.js";

const MAX_BUFFERED_AMOUNT = 64 * 1024; // 64 KB, matching simple-peer

export class DataChannelSender {
  #currentSendContext?: { cancel: () => void };

  constructor(
    private readonly channel: RTCDataChannel,
    private readonly maxMessageSize: number,
  ) {}

  async sendData(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments
    data: ArrayBuffer | ArrayBufferView<ArrayBuffer>,
    onChunkSent?: (chunkSize: number) => void,
  ): Promise<void> {
    if (this.#currentSendContext) {
      throw new Error("Already sending data");
    }
    if (this.channel.readyState !== "open") {
      throw new Error("Data channel is not open");
    }

    this.channel.bufferedAmountLowThreshold = MAX_BUFFERED_AMOUNT;

    const { promise, resolve, reject } = getPromiseWithResolvers();

    let offset = 0;
    let isSettled = false;

    const cleanup = (): boolean => {
      if (isSettled) return false;
      isSettled = true;
      this.#currentSendContext = undefined;
      this.channel.removeEventListener("bufferedamountlow", sendChunks);
      this.channel.removeEventListener("closing", onClose);
      this.channel.removeEventListener("close", onClose);
      this.channel.removeEventListener("error", onError);
      return true;
    };

    this.#currentSendContext = {
      cancel: () => {
        if (cleanup()) reject(new Error("Send cancelled"));
      },
    };

    const onClose = () => {
      if (cleanup()) reject(new Error("Data channel closed"));
    };

    const onError = (event: Event) => {
      if (!cleanup()) return;

      const message = getRTCErrorMessage(event, "Unknown error");
      reject(new Error(`Data channel error: ${message}`));
    };

    const buffer = ArrayBuffer.isView(data) ? data.buffer : data;
    const byteOffset = ArrayBuffer.isView(data) ? data.byteOffset : 0;

    const sendChunks = () => {
      if (isSettled) return;
      if (this.channel.readyState !== "open") {
        if (cleanup()) {
          reject(
            new Error(
              `Data channel not open (state: ${this.channel.readyState})`,
            ),
          );
        }
        return;
      }

      try {
        while (offset < data.byteLength) {
          if (this.channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
            return;
          }

          const bytesToSend = Math.min(
            this.maxMessageSize,
            data.byteLength - offset,
          );
          const chunk = new Uint8Array(
            buffer,
            byteOffset + offset,
            bytesToSend,
          );

          this.channel.send(chunk);
          offset += bytesToSend;
          onChunkSent?.(bytesToSend);
          // The callback may have called cancel(), which settles the promise.
          if (!this.#currentSendContext) return;
        }
      } catch (error) {
        if (cleanup()) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
        return;
      }

      if (cleanup()) resolve();
    };

    this.channel.addEventListener("bufferedamountlow", sendChunks);
    this.channel.addEventListener("closing", onClose);
    this.channel.addEventListener("close", onClose);
    this.channel.addEventListener("error", onError);

    // Start sending
    sendChunks();

    return promise;
  }

  cancel(): void {
    this.#currentSendContext?.cancel();
  }
}
