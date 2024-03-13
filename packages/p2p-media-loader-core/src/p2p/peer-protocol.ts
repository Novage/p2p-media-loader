import { PeerConnection } from "bittorrent-tracker";
import { CoreEventMap, Settings } from "../types";
import * as Utils from "../utils/utils";
import * as Command from "./commands";
import { EventEmitter } from "../utils/event-emitter";

export type PeerSettings = Pick<
  Settings,
  | "p2pNotReceivingBytesTimeoutMs"
  | "webRtcMaxMessageSize"
  | "p2pErrorRetries"
  | "validateP2PSegment"
>;

export class PeerProtocol {
  private commandChunks?: Command.BinaryCommandChunksJoiner;
  private uploadingContext?: { stopUploading: () => void };
  private readonly onChunkDownloaded: CoreEventMap["onChunkDownloaded"];
  private readonly onChunkUploaded: CoreEventMap["onChunkUploaded"];

  constructor(
    private readonly connection: PeerConnection,
    private readonly settings: PeerSettings,
    private readonly eventHandlers: {
      onCommandReceived: (command: Command.PeerCommand) => void;
      onSegmentChunkReceived: (data: Uint8Array) => void;
    },
    eventEmmiter: EventEmitter<CoreEventMap>,
  ) {
    this.onChunkDownloaded =
      eventEmmiter.getEventDispatcher("onChunkDownloaded");
    this.onChunkUploaded = eventEmmiter.getEventDispatcher("onChunkUploaded");
    connection.on("data", this.onDataReceived);
  }

  private onDataReceived = (data: Uint8Array) => {
    if (Command.isCommandChunk(data)) {
      this.receivingCommandBytes(data);
    } else {
      this.eventHandlers.onSegmentChunkReceived(data);

      this.onChunkDownloaded(data.length, "p2p", this.connection.idUtf8);
    }
  };

  sendCommand(command: Command.PeerCommand) {
    const binaryCommandBuffers = Command.serializePeerCommand(
      command,
      this.settings.webRtcMaxMessageSize,
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
        this.onChunkUploaded(chunk.byteLength, this.connection.idUtf8);
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
        },
      );
    }
    try {
      this.commandChunks.addCommandChunk(buffer);
    } catch (err) {
      if (!(err instanceof Command.BinaryCommandJoiningError)) return;
      this.commandChunks = undefined;
    }
  }
}

function* getBufferChunks(
  data: ArrayBuffer,
  maxChunkSize: number,
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
