import debug from "debug";
import { CoreEventMap, StreamConfig } from "../types.js";
import * as Command from "./commands/index.js";
import { EventTarget } from "../utils/event-target.js";
import { DataChannelSender } from "../webtorrent/data-channel-sender.js";

export type PeerConfig = Pick<
  StreamConfig,
  | "p2pNotReceivingBytesTimeoutMs"
  | "webRtcMaxMessageSize"
  | "p2pErrorRetries"
  | "validateP2PSegment"
>;

const logger = debug("p2pml-core:peer-protocol");

export class PeerProtocol {
  private commandChunks?: Command.BinaryCommandChunksJoiner;
  private dataChannelSender: DataChannelSender;
  private uploadingRequestId?: number;
  private readonly onChunkDownloaded: CoreEventMap["onChunkDownloaded"];
  private readonly onChunkUploaded: CoreEventMap["onChunkUploaded"];

  constructor(
    private readonly channel: RTCDataChannel,
    private readonly peerConfig: PeerConfig,
    private readonly eventHandlers: {
      onCommandReceived: (command: Command.PeerCommand) => void;
      onSegmentChunkReceived: (data: Uint8Array) => void;
    },
    eventTarget: EventTarget<CoreEventMap>,
    private readonly peerId: string,
  ) {
    this.dataChannelSender = new DataChannelSender(
      channel,
      peerConfig.webRtcMaxMessageSize,
    );
    this.onChunkDownloaded =
      eventTarget.getEventDispatcher("onChunkDownloaded");
    this.onChunkUploaded = eventTarget.getEventDispatcher("onChunkUploaded");

    if (channel.binaryType !== "arraybuffer") {
      throw new Error(
        `Expected binaryType "arraybuffer", got "${channel.binaryType}"`,
      );
    }
    channel.addEventListener("message", this.onMessageReceived);
  }

  private onMessageReceived = (event: MessageEvent) => {
    // WebRTC data channel assumed to have binaryType = "arraybuffer"
    const data = new Uint8Array(event.data as ArrayBuffer);
    if (Command.isCommandChunk(data)) {
      this.receivingCommandBytes(data);
    } else {
      this.eventHandlers.onSegmentChunkReceived(data);
      this.onChunkDownloaded(data.byteLength, "p2p", this.peerId);
    }
  };

  sendCommand(command: Command.PeerCommand) {
    if (this.channel.readyState !== "open") {
      logger(
        "dropping command %d (channel state: %s)",
        command.c,
        this.channel.readyState,
      );
      return;
    }

    const binaryCommandBuffers = Command.serializePeerCommand(
      command,
      this.peerConfig.webRtcMaxMessageSize,
    );
    try {
      for (const buffer of binaryCommandBuffers) {
        this.channel.send(buffer);
      }
    } catch (err) {
      logger("error sending command: %O", err);
    }
  }

  stopUploadingSegmentData() {
    this.dataChannelSender.cancel();
    this.uploadingRequestId = undefined;
  }

  getUploadingRequestId() {
    return this.uploadingRequestId;
  }

  async splitSegmentDataToChunksAndUploadAsync(
    data: ArrayBuffer | ArrayBufferView<ArrayBuffer>,
    requestId: number,
  ) {
    if (this.uploadingRequestId !== undefined) {
      throw new Error(`Some segment data is already uploading.`);
    }

    this.uploadingRequestId = requestId;

    try {
      await this.dataChannelSender.sendData(data, (chunkSize) => {
        this.onChunkUploaded(chunkSize, this.peerId);
      });
    } finally {
      if (this.uploadingRequestId === requestId) {
        this.uploadingRequestId = undefined;
      }
    }
  }

  private receivingCommandBytes(buffer: Uint8Array) {
    this.commandChunks ??= new Command.BinaryCommandChunksJoiner(
      (commandBuffer) => {
        this.commandChunks = undefined;
        try {
          const command = Command.deserializeCommand(commandBuffer);
          this.eventHandlers.onCommandReceived(command);
        } catch (err) {
          logger("error processing command: %O", err);
        }
      },
    );
    try {
      this.commandChunks.addCommandChunk(buffer);
    } catch (err) {
      logger("error receiving command chunks: %O", err);
      this.commandChunks = undefined;
    }
  }

  destroy() {
    this.channel.removeEventListener("message", this.onMessageReceived);
    this.dataChannelSender.cancel();
    this.commandChunks = undefined;
    this.uploadingRequestId = undefined;
  }
}
