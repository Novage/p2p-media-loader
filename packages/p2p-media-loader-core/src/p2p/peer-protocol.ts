import debug from "debug";
import { CoreEventMap, StreamConfig, StreamType } from "../types.js";
import * as Command from "./commands/index.js";
import { EventTarget } from "../utils/event-target.js";
import { DataChannelSender } from "../webtorrent/data-channel-sender.js";

export type PeerConfig = Pick<
  StreamConfig,
  | "p2pNotReceivingBytesTimeoutMs"
  | "webRtcMaxMessageSize"
  | "p2pErrorRetries"
  | "validateP2PSegment"
> & { streamType: StreamType; infoHash: string };

const logger = debug("p2pml-core:peer-protocol");

export class PeerProtocol {
  #commandChunks?: Command.BinaryCommandChunksJoiner;
  #dataChannelSender: DataChannelSender;
  #uploadingRequestId?: number;
  readonly #onChunkDownloaded: CoreEventMap["onChunkDownloaded"];
  readonly #onChunkUploaded: CoreEventMap["onChunkUploaded"];
  readonly #channel: RTCDataChannel;
  readonly #peerConfig: PeerConfig;
  readonly #eventHandlers: {
    onCommandReceived: (command: Command.PeerCommand) => void;
    onSegmentChunkReceived: (data: Uint8Array) => void;
  };
  readonly #peerId: string;

  constructor(
    channel: RTCDataChannel,
    peerConfig: PeerConfig,
    eventHandlers: {
      onCommandReceived: (command: Command.PeerCommand) => void;
      onSegmentChunkReceived: (data: Uint8Array) => void;
    },
    eventTarget: EventTarget<CoreEventMap>,
    peerId: string,
  ) {
    this.#channel = channel;
    this.#peerConfig = peerConfig;
    this.#eventHandlers = eventHandlers;
    this.#peerId = peerId;

    this.#dataChannelSender = new DataChannelSender(
      channel,
      peerConfig.webRtcMaxMessageSize,
    );
    this.#onChunkDownloaded =
      eventTarget.getEventDispatcher("onChunkDownloaded");
    this.#onChunkUploaded = eventTarget.getEventDispatcher("onChunkUploaded");

    if (channel.binaryType !== "arraybuffer") {
      throw new Error(
        `Expected binaryType "arraybuffer", got "${channel.binaryType}"`,
      );
    }
    channel.addEventListener("message", this.#onMessageReceived);
  }

  #onMessageReceived = (event: MessageEvent) => {
    // WebRTC data channel assumed to have binaryType = "arraybuffer"
    const data = new Uint8Array(event.data as ArrayBuffer);
    if (Command.isCommandChunk(data)) {
      this.#receivingCommandBytes(data);
    } else {
      this.#eventHandlers.onSegmentChunkReceived(data);
      this.#onChunkDownloaded(
        data.byteLength,
        "p2p",
        this.#peerId,
        this.#peerConfig.streamType,
        this.#peerConfig.infoHash,
      );
    }
  };

  sendCommand(command: Command.PeerCommand) {
    if (this.#channel.readyState !== "open") {
      logger(
        "dropping command %d (channel state: %s)",
        command.c,
        this.#channel.readyState,
      );
      return;
    }

    const binaryCommandBuffers = Command.serializePeerCommand(
      command,
      this.#peerConfig.webRtcMaxMessageSize,
    );
    try {
      for (const buffer of binaryCommandBuffers) {
        this.#channel.send(buffer);
      }
    } catch (err) {
      logger("error sending command: %O", err);
    }
  }

  stopUploadingSegmentData() {
    this.#dataChannelSender.cancel();
    this.#uploadingRequestId = undefined;
  }

  getUploadingRequestId() {
    return this.#uploadingRequestId;
  }

  async splitSegmentDataToChunksAndUploadAsync(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments
    data: ArrayBuffer | ArrayBufferView<ArrayBuffer>,
    requestId: number,
  ) {
    if (this.#uploadingRequestId !== undefined) {
      throw new Error(`Some segment data is already uploading.`);
    }

    this.#uploadingRequestId = requestId;

    try {
      await this.#dataChannelSender.sendData(data, (chunkSize) => {
        this.#onChunkUploaded(
          chunkSize,
          this.#peerId,
          this.#peerConfig.streamType,
          this.#peerConfig.infoHash,
        );
      });
    } finally {
      if (this.#uploadingRequestId === requestId) {
        this.#uploadingRequestId = undefined;
      }
    }
  }

  #receivingCommandBytes(buffer: Uint8Array) {
    this.#commandChunks ??= new Command.BinaryCommandChunksJoiner(
      (commandBuffer) => {
        this.#commandChunks = undefined;
        try {
          const command = Command.deserializeCommand(commandBuffer);
          this.#eventHandlers.onCommandReceived(command);
        } catch (err) {
          logger("error processing command: %O", err);
        }
      },
    );
    try {
      this.#commandChunks.addCommandChunk(buffer);
    } catch (err) {
      logger("error receiving command chunks: %O", err);
      this.#commandChunks = undefined;
    }
  }

  destroy() {
    this.#channel.removeEventListener("message", this.#onMessageReceived);
    this.#dataChannelSender.cancel();
    this.#commandChunks = undefined;
    this.#uploadingRequestId = undefined;
  }
}
