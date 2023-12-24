import { PeerConnection } from "bittorrent-tracker";
import * as Command from "./commands";
import * as Utils from "../utils/utils";
import { Settings } from "../types";

export type PeerSettings = Pick<
  Settings,
  | "p2pNotReceivingBytesTimeoutMs"
  | "webRtcMaxMessageSize"
  | "maxPeerNotReceivingBytesTimeoutErrors"
>;

export class PeerInterface {
  private commandChunks?: Command.BinaryCommandChunksJoiner;
  private uploadingContext?: { stopUploading: () => void };

  constructor(
    private readonly connection: PeerConnection,
    private readonly settings: PeerSettings,
    private readonly eventHandlers: {
      onCommandReceived: (command: Command.PeerCommand) => void;
      onSegmentChunkReceived: (data: Uint8Array) => void;
      onDestroy: () => void;
    }
  ) {
    connection.on("data", this.onDataReceived);
    connection.on("close", this.onPeerClosed);
    connection.on("error", this.onConnectionError);
  }

  private onDataReceived = (data: Uint8Array) => {
    if (Command.isCommandChunk(data)) {
      this.receivingCommandBytes(data);
    } else {
      this.eventHandlers.onSegmentChunkReceived(data);
    }
  };

  private onPeerClosed = () => {
    this.destroy();
    this.eventHandlers.onDestroy();
  };

  private onConnectionError = (error: { code: string }) => {
    if (error.code === "ERR_DATA_CHANNEL") {
      this.destroy();
      this.eventHandlers.onDestroy();
    }
  };

  sendCommand(command: Command.PeerCommand) {
    const binaryCommandBuffers = Command.serializePeerCommand(
      command,
      this.settings.webRtcMaxMessageSize
    );
    for (const buffer of binaryCommandBuffers) {
      this.connection.send(buffer);
    }
  }

  stopUploadingSegmentData() {
    this.uploadingContext?.stopUploading();
    this.uploadingContext = undefined;
  }

  async splitSegmentDataToChunksAndUploadAsync(data: Uint8Array) {
    if (this.uploadingContext) {
      throw new Error(`Some segment data is already uploading.`);
    }
    const chunks = getBufferChunks(data, this.settings.webRtcMaxMessageSize);
    const channel = this.connection._channel;
    const { promise, resolve, reject } = Utils.getControlledPromise<void>();

    let isUploadingSegmentData = false;
    this.uploadingContext = {
      stopUploading: () => {
        isUploadingSegmentData = false;
      },
    };

    const sendChunk = () => {
      while (channel.bufferedAmount <= channel.bufferedAmountLowThreshold) {
        const chunk = chunks.next().value;
        if (!chunk) {
          resolve();
          break;
        }
        if (chunk && !isUploadingSegmentData) {
          reject();
          break;
        }
        this.connection.send(chunk);
      }
    };
    try {
      channel.addEventListener("bufferedamountlow", sendChunk);
      isUploadingSegmentData = true;
      sendChunk();
      await promise;
      return promise;
    } finally {
      channel.removeEventListener("bufferedamountlow", sendChunk);
      this.uploadingContext = undefined;
    }
  }

  private receivingCommandBytes(buffer: Uint8Array) {
    if (!this.commandChunks) {
      this.commandChunks = new Command.BinaryCommandChunksJoiner(
        (commandBuffer) => {
          this.commandChunks = undefined;
          const command = Command.deserializeCommand(commandBuffer);
          this.eventHandlers.onCommandReceived(command);
        }
      );
    }
    try {
      this.commandChunks.addCommandChunk(buffer);
    } catch (err) {
      if (!(err instanceof Command.BinaryCommandJoiningError)) return;
      this.commandChunks = undefined;
    }
  }

  destroy() {
    this.connection.destroy();
  }
}

function* getBufferChunks(
  data: ArrayBuffer,
  maxChunkSize: number
): Generator<ArrayBuffer, void> {
  let bytesLeft = data.byteLength;
  while (bytesLeft > 0) {
    const bytesToSend = bytesLeft >= maxChunkSize ? maxChunkSize : bytesLeft;
    const from = data.byteLength - bytesLeft;
    const buffer = data.slice(from, from + bytesToSend);
    bytesLeft -= bytesToSend;
    yield buffer;
  }
}
