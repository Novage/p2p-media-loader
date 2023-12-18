import { PeerConnection } from "bittorrent-tracker";
import {
  Request,
  RequestControls,
  RequestError,
  PeerRequestErrorType,
} from "../request";
import * as Command from "./commands";
import { Segment, Settings } from "../types";
import * as Utils from "../utils/utils";
import debug from "debug";

const { PeerCommandType } = Command;
type PeerEventHandlers = {
  onPeerClosed: (peer: Peer) => void;
  onSegmentRequested: (
    peer: Peer,
    segmentId: number,
    byteFrom?: number
  ) => void;
};

type PeerSettings = Pick<
  Settings,
  "p2pNotReceivingBytesTimeoutMs" | "webRtcMaxMessageSize"
>;

export class Peer {
  readonly id: string;
  private requestContext?: { request: Request; controls: RequestControls };
  private loadedSegments = new Set<number>();
  private httpLoadingSegments = new Set<number>();
  private readonly logger = debug("core:peer");
  private isUploadingSegment = false;

  constructor(
    private readonly connection: PeerConnection,
    private readonly eventHandlers: PeerEventHandlers,
    private readonly settings: PeerSettings
  ) {
    this.id = Utils.hexToUtf8(connection.id);
    this.eventHandlers = eventHandlers;

    connection.on("data", (data) => {
      try {
        const command = Command.deserializeCommand(data);
        this.receiveCommand(command);
      } catch (err) {
        this.receiveSegmentChunk(data);
      }
    });
    connection.on("close", () => {
      this.logger(`connection with peer closed: ${this.id}`);
      this.destroy();
      this.eventHandlers.onPeerClosed(this);
    });
    connection.on("error", (error) => {
      if (error.code === "ERR_DATA_CHANNEL") {
        this.logger(`peer error: ${this.id} ${error.code}`);
        this.destroy();
        this.eventHandlers.onPeerClosed(this);
      }
    });
  }

  get downloadingSegment(): Segment | undefined {
    return this.requestContext?.request.segment;
  }

  getSegmentStatus(segment: Segment): "loaded" | "http-loading" | undefined {
    const { externalId } = segment;
    if (this.loadedSegments.has(externalId)) return "loaded";
    if (this.httpLoadingSegments.has(externalId)) return "http-loading";
  }

  private receiveCommand(command: Command.PeerCommand) {
    switch (command.c) {
      case PeerCommandType.SegmentsAnnouncement:
        this.loadedSegments = new Set(command.l);
        this.httpLoadingSegments = new Set(command.p);
        break;

      case PeerCommandType.SegmentRequest:
        this.eventHandlers.onSegmentRequested(this, command.i, command.b);
        break;

      case PeerCommandType.SegmentData:
        {
          const request = this.requestContext?.request;
          this.requestContext?.controls.firstBytesReceived();
          if (
            request?.segment.externalId === command.i &&
            request.totalBytes === undefined
          ) {
            request.setTotalBytes(command.s);
          }
        }
        break;

      case PeerCommandType.SegmentAbsent:
        if (this.requestContext?.request.segment.externalId === command.i) {
          this.cancelSegmentRequest("peer-segment-absent");
          this.loadedSegments.delete(command.i);
        }
        break;

      case PeerCommandType.CancelSegmentRequest:
        this.isUploadingSegment = false;
        break;
    }
  }

  private sendCommand(command: Command.PeerCommand) {
    const binaryCommandBuffers = Command.serializePeerCommand(
      command,
      this.settings.webRtcMaxMessageSize
    );
    for (const buffer of binaryCommandBuffers) {
      this.connection.send(buffer);
    }
  }

  fulfillSegmentRequest(request: Request) {
    if (this.requestContext) {
      throw new Error("Segment already is downloading");
    }
    this.requestContext = {
      request,
      controls: request.start(
        { type: "p2p", peerId: this.id },
        {
          abort: this.abortRequest,
          notReceivingBytesTimeoutMs:
            this.settings.p2pNotReceivingBytesTimeoutMs,
        }
      ),
    };
    const command: Command.PeerRequestSegmentCommand = {
      c: PeerCommandType.SegmentRequest,
      i: request.segment.externalId,
    };
    if (request.loadedBytes) command.b = request.loadedBytes;
    this.sendCommand(command);
  }

  sendSegmentsAnnouncement(announcement: {
    loaded: number[];
    httpLoading: number[];
  }) {
    const command: Command.PeerSegmentAnnouncementCommand = {
      c: PeerCommandType.SegmentsAnnouncement,
      p: announcement.httpLoading,
      l: announcement.loaded,
    };
    this.sendCommand(command);
  }

  async sendSegmentData(segmentExternalId: number, data: ArrayBuffer) {
    this.logger(`send segment ${segmentExternalId} to ${this.id}`);
    const command: Command.PeerSendSegmentCommand = {
      c: PeerCommandType.SegmentData,
      i: segmentExternalId,
      s: data.byteLength,
    };
    this.sendCommand(command);

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
      this.logger(`segment ${segmentExternalId} has been sent to ${this.id}`);
    } catch (err) {
      this.logger(`cancel segment uploading ${segmentExternalId}`);
    } finally {
      channel.removeEventListener("bufferedamountlow", sendChunk);
      this.isUploadingSegment = false;
    }
  }

  sendSegmentAbsent(segmentExternalId: number) {
    this.sendCommand({
      c: PeerCommandType.SegmentAbsent,
      i: segmentExternalId,
    });
  }

  private receiveSegmentChunk(chunk: Uint8Array): void {
    if (!this.requestContext) return;
    const { request, controls } = this.requestContext;
    controls.addLoadedChunk(chunk);

    if (request.loadedBytes === request.totalBytes) {
      controls.completeOnSuccess();
      this.requestContext = undefined;
    } else if (
      request.totalBytes !== undefined &&
      request.loadedBytes > request.totalBytes
    ) {
      this.cancelSegmentRequest("peer-response-bytes-mismatch");
    }
  }

  private abortRequest = () => {
    if (!this.requestContext) return;
    const { request } = this.requestContext;
    this.sendCancelSegmentRequestCommand(request.segment);
    this.requestContext = undefined;
  };

  private cancelSegmentRequest(type: PeerRequestErrorType) {
    if (!this.requestContext) return;
    const { request, controls } = this.requestContext;
    const { segment } = request;
    this.logger(`cancel segment request ${segment.externalId} (${type})`);
    const error = new RequestError(type);
    if (type === "peer-response-bytes-mismatch") {
      this.sendCancelSegmentRequestCommand(request.segment);
    }
    controls.abortOnError(error);
    this.requestContext = undefined;
  }

  private sendCancelSegmentRequestCommand(segment: Segment) {
    this.sendCommand({
      c: PeerCommandType.CancelSegmentRequest,
      i: segment.externalId,
    });
  }

  destroy() {
    this.cancelSegmentRequest("peer-closed");
    this.connection.destroy();
  }

  static getPeerIdFromHexString(hex: string) {
    return Utils.hexToUtf8(hex);
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
