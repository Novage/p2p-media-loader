import { PeerConnection } from "bittorrent-tracker";
import * as Command from "./commands";
import * as Utils from "../utils/utils";
import debug from "debug";
import { Settings } from "../types";

export type PeerSettings = Pick<
  Settings,
  "p2pNotReceivingBytesTimeoutMs" | "webRtcMaxMessageSize"
>;

export abstract class PeerBase {
  readonly id: string;
  private isUploadingSegment = false;
  private commandChunks?: Command.BinaryCommandChunksJoiner;
  protected readonly logger = debug("core:peer");

  protected constructor(
    private readonly connection: PeerConnection,
    protected readonly settings: PeerSettings
  ) {
    this.id = PeerBase.getPeerIdFromConnection(connection);
    connection.on("data", this.onDataReceived);
    connection.on("close", this.onPeerClosed);
    connection.on("error", this.onConnectionError);
  }

  private onDataReceived = (data: Uint8Array) => {
    if (Command.isCommandChunk(data)) this.receivingCommandBytes(data);
    else this.receiveSegmentChunk(data);
  };

  private onPeerClosed = () => {
    this.logger(`connection with peer closed: ${this.id}`);
    this.destroy();
  };

  private onConnectionError = (error: { code: string }) => {
    this.logger(`peer error: ${this.id} ${error.code}`);
    this.destroy();
  };

  protected sendCommand(command: Command.PeerCommand) {
    const binaryCommandBuffers = Command.serializePeerCommand(
      command,
      this.settings.webRtcMaxMessageSize
    );
    for (const buffer of binaryCommandBuffers) {
      this.connection.send(buffer);
    }
  }

  protected async splitToChunksAndUploadAsynchronously(data: Uint8Array) {
    const chunks = getBufferChunks(data, this.settings.webRtcMaxMessageSize);
    const channel = this.connection._channel;
    const { promise, resolve, reject } = Utils.getControlledPromise<void>();

    const sendChunk = () => {
      while (channel.bufferedAmount <= channel.bufferedAmountLowThreshold) {
        const chunk = chunks.next().value;
        if (!chunk) {
          resolve();
          break;
        }
        if (chunk && !this.isUploadingSegment) {
          reject();
          break;
        }
        this.connection.send(chunk);
      }
    };
    try {
      channel.addEventListener("bufferedamountlow", sendChunk);
      this.isUploadingSegment = true;
      sendChunk();
      await promise;
      return promise;
    } finally {
      this.isUploadingSegment = false;
    }
  }

  protected cancelDataUploading() {
    this.isUploadingSegment = false;
  }

  private receivingCommandBytes(buffer: Uint8Array) {
    if (!this.commandChunks) {
      this.commandChunks = new Command.BinaryCommandChunksJoiner(
        (commandBuffer) => {
          this.commandChunks = undefined;
          const command = Command.deserializeCommand(commandBuffer);
          this.receiveCommand(command);
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

  protected abstract receiveCommand(command: Command.PeerCommand): void;

  protected abstract receiveSegmentChunk(data: Uint8Array): void;

  protected destroy() {
    this.connection.destroy();
  }

  static getPeerIdFromConnection(connection: PeerConnection) {
    return Utils.hexToUtf8(connection.id);
  }
}

function* getBufferChunks(
  data: ArrayBuffer,
  maxChunkSize: number
): Generator<ArrayBuffer> {
  let bytesLeft = data.byteLength;
  while (bytesLeft > 0) {
    const bytesToSend = bytesLeft >= maxChunkSize ? maxChunkSize : bytesLeft;
    const from = data.byteLength - bytesLeft;
    const buffer = data.slice(from, from + bytesToSend);
    bytesLeft -= bytesToSend;
    yield buffer;
  }
}
