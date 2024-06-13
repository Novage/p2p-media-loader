import { PeerConnection } from "bittorrent-tracker";
import { CoreEventMap, StreamConfig } from "../types";
import * as Utils from "../utils/utils";
import * as Command from "./commands";
import { EventTarget } from "../utils/event-target";

export type PeerConfig = Pick<
  StreamConfig,
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
    private readonly peerConfig: PeerConfig,
    private readonly eventHandlers: {
      onCommandReceived: (command: Command.PeerCommand) => void;
      onSegmentChunkReceived: (data: Uint8Array) => void;
    },
    eventTarget: EventTarget<CoreEventMap>,
  ) {
    this.onChunkDownloaded =
      eventTarget.getEventDispatcher("onChunkDownloaded");
    this.onChunkUploaded = eventTarget.getEventDispatcher("onChunkUploaded");
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
      this.peerConfig.webRtcMaxMessageSize,
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
    const chunks = getBufferChunks(data, this.peerConfig.webRtcMaxMessageSize);
    const { promise, resolve, reject } = Utils.getControlledPromise<void>();

    let isUploadingSegmentData = false;

    const uploadingContext = {
      stopUploading: () => {
        isUploadingSegmentData = false;
      },
    };

    this.uploadingContext = uploadingContext;

    const sendChunk = () => {
      if (!isUploadingSegmentData) {
        reject();
        return;
      }

      while (true) {
        const chunk = chunks.next().value;

        if (!chunk) {
          resolve();
          break;
        }

        const drained = this.connection.write(chunk);
        this.onChunkUploaded(chunk.byteLength, this.connection.idUtf8);
        if (!drained) break;
      }
    };

    try {
      this.connection.on("drain", sendChunk);
      isUploadingSegmentData = true;
      sendChunk();
      await promise;
    } finally {
      this.connection.off("drain", sendChunk);

      if (this.uploadingContext === uploadingContext) {
        this.uploadingContext = undefined;
      }
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
