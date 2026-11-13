import { getPromiseWithResolvers } from "../utils/utils.js";
import { getRTCErrorMessage } from "./utils.js";

const MAX_BUFFERED_AMOUNT = 64 * 1024; // 64 KB, matching simple-peer

/**
 * How long the send may sit on a full buffer without any of it draining. A
 * peer that stops reading while holding the connection open would otherwise
 * leave the send unsettled for good: SCTP keeps the channel healthy, no
 * `bufferedamountlow` ever arrives, and the peer reads as uploading forever,
 * which exempts it from churn cleanup and blocks its next upload. Ten
 * seconds without a single byte leaving a 64 KB buffer is well below any
 * throughput worth keeping the slot for.
 */
const STALL_TIMEOUT_MS = 10_000;

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
    let stallTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let stalledAtOffset = -1;

    const clearStallTimeout = () => {
      if (stallTimeoutId === undefined) return;
      clearTimeout(stallTimeoutId);
      stallTimeoutId = undefined;
    };

    const cleanup = (): boolean => {
      if (isSettled) return false;
      isSettled = true;
      clearStallTimeout();
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

    const onStall = () => {
      stallTimeoutId = undefined;
      if (cleanup()) {
        reject(
          new Error(
            `Send stalled: nothing sent for ${STALL_TIMEOUT_MS} ms ` +
              `(${offset} of ${data.byteLength} bytes sent)`,
          ),
        );
      }
    };

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
            // The watchdog is rearmed by progress, not by the drain event
            // alone: commands share the channel and can refill the buffer
            // between the event and this handler.
            if (stallTimeoutId === undefined || offset !== stalledAtOffset) {
              clearStallTimeout();
              stalledAtOffset = offset;
              stallTimeoutId = setTimeout(onStall, STALL_TIMEOUT_MS);
            }
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
