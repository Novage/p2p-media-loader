import { PeerConnection } from "bittorrent-tracker";
import {
  JsonSegmentAnnouncement,
  PeerCommand,
  PeerSegmentAnnouncementCommand,
  PeerSegmentCommand,
  PeerSegmentRequestCommand,
  PeerSendSegmentCommand,
} from "../internal-types";
import { PeerCommandType, PeerSegmentStatus } from "../enums";
import {
  Request,
  RequestControls,
  RequestError,
  PeerRequestErrorType,
} from "../request";
import { Segment, Settings } from "../types";
import * as PeerUtil from "../utils/peer";
import * as Utils from "../utils/utils";
import debug from "debug";

type PeerEventHandlers = {
  onPeerClosed: (peer: Peer) => void;
  onSegmentRequested: (peer: Peer, segmentId: string) => void;
};

type PeerSettings = Pick<
  Settings,
  "p2pNotReceivingBytesTimeoutMs" | "webRtcMaxMessageSize"
>;

export class Peer {
  readonly id: string;
  private segments = new Map<string, PeerSegmentStatus>();
  private requestContext?: { request: Request; controls: RequestControls };
  private readonly logger = debug("core:peer");
  private isUploadingSegment = false;

  constructor(
    private readonly connection: PeerConnection,
    private readonly eventHandlers: PeerEventHandlers,
    private readonly settings: PeerSettings
  ) {
    this.id = Peer.getPeerIdFromHexString(connection.id);
    this.eventHandlers = eventHandlers;

    connection.on("data", this.onReceiveData.bind(this));
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

  getSegmentStatus(segment: Segment): PeerSegmentStatus | undefined {
    const { externalId } = segment;
    return this.segments.get(externalId);
  }

  private onReceiveData(data: Uint8Array) {
    const command = PeerUtil.getPeerCommandFromArrayBuffer(data);
    if (!command) {
      this.receiveSegmentChunk(data);
      return;
    }

    switch (command.c) {
      case PeerCommandType.SegmentsAnnouncement:
        this.segments = PeerUtil.getSegmentsFromPeerAnnouncement(command.a);
        break;

      case PeerCommandType.SegmentRequest:
        this.eventHandlers.onSegmentRequested(this, command.i);
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
          this.segments.delete(command.i);
        }
        break;

      case PeerCommandType.CancelSegmentRequest:
        this.isUploadingSegment = false;
        break;
    }
  }

  private sendCommand(command: PeerCommand) {
    this.connection.send(JSON.stringify(command));
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
    const command: PeerSegmentRequestCommand = {
      c: PeerCommandType.SegmentRequest,
      i: request.segment.externalId,
    };
    if (request.loadedBytes) command.b = request.loadedBytes;
    this.sendCommand(command);
  }

  sendSegmentsAnnouncement(announcement: JsonSegmentAnnouncement) {
    const command: PeerSegmentAnnouncementCommand = {
      c: PeerCommandType.SegmentsAnnouncement,
      a: announcement,
    };
    this.sendCommand(command);
  }

  async sendSegmentData(segmentExternalId: string, data: ArrayBuffer) {
    this.logger(`send segment ${segmentExternalId} to ${this.id}`);
    const command: PeerSendSegmentCommand = {
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

  sendSegmentAbsent(segmentExternalId: string) {
    const command: PeerSegmentCommand = {
      c: PeerCommandType.SegmentAbsent,
      i: segmentExternalId,
    };
    this.sendCommand(command);
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
    return hexToUtf8(hex);
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

function hexToUtf8(hexString: string) {
  const bytes = new Uint8Array(hexString.length / 2);

  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.slice(i, i + 2), 16);
  }
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}
