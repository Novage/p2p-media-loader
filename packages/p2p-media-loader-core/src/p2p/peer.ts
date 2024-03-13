import { PeerConnection } from "bittorrent-tracker";
import debug from "debug";
import { Request, RequestControls } from "../requests/request";
import {
  CoreEventMap,
  Segment,
  PeerRequestErrorType,
  RequestError,
  RequestInnerErrorType,
} from "../types";
import * as Utils from "../utils/utils";
import * as Command from "./commands";
import { PeerProtocol, PeerSettings } from "./peer-protocol";
import { EventEmitter } from "../utils/event-emitter";

const { PeerCommandType } = Command;
type PeerEventHandlers = {
  onPeerClosed: (peer: Peer) => void;
  onSegmentRequested: (
    peer: Peer,
    segmentId: number,
    byteFrom?: number,
  ) => void;
};

export class Peer {
  readonly id: string;
  private readonly peerProtocol;
  private downloadingContext?: {
    request: Request;
    controls: RequestControls;
    isSegmentDataCommandReceived: boolean;
  };
  private loadedSegments = new Set<number>();
  private httpLoadingSegments = new Set<number>();
  private downloadingErrors: RequestError<
    PeerRequestErrorType | RequestInnerErrorType
  >[] = [];
  private logger = debug("core:peer");
  private readonly onPeerClosed: CoreEventMap["onPeerClose"];

  constructor(
    private readonly connection: PeerConnection,
    private readonly eventHandlers: PeerEventHandlers,
    private readonly settings: PeerSettings,
    eventEmmiter: EventEmitter<CoreEventMap>,
  ) {
    this.onPeerClosed = eventEmmiter.getEventDispatcher("onPeerClose");

    this.id = Peer.getPeerIdFromConnection(connection);
    this.peerProtocol = new PeerProtocol(
      connection,
      settings,
      {
        onSegmentChunkReceived: this.onSegmentChunkReceived,
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onCommandReceived: this.onCommandReceived,
      },
      eventEmmiter,
    );
    eventEmmiter.getEventDispatcher("onPeerConnect")(this.id);
    connection.on("close", this.onPeerConnectionClosed);
    connection.on("error", this.onConnectionError);
  }

  get downloadingSegment(): Segment | undefined {
    return this.downloadingContext?.request.segment;
  }

  getSegmentStatus(segment: Segment): "loaded" | "http-loading" | undefined {
    const { externalId } = segment;
    if (this.loadedSegments.has(externalId)) return "loaded";
    if (this.httpLoadingSegments.has(externalId)) return "http-loading";
  }

  private onCommandReceived = async (command: Command.PeerCommand) => {
    switch (command.c) {
      case PeerCommandType.SegmentsAnnouncement:
        this.loadedSegments = new Set(command.l);
        this.httpLoadingSegments = new Set(command.p);
        break;

      case PeerCommandType.SegmentRequest:
        this.peerProtocol.stopUploadingSegmentData();
        this.eventHandlers.onSegmentRequested(this, command.i, command.b);
        break;

      case PeerCommandType.SegmentData:
        {
          if (!this.downloadingContext) break;
          const { request, controls } = this.downloadingContext;
          if (request.segment.externalId !== command.i) break;
          this.downloadingContext.isSegmentDataCommandReceived = true;
          controls.firstBytesReceived();
          if (request.totalBytes === undefined) {
            request.setTotalBytes(command.s);
          } else if (request.totalBytes - request.loadedBytes !== command.s) {
            request.clearLoadedBytes();
            this.sendCancelSegmentRequestCommand(request.segment);
            this.cancelSegmentDownloading(
              "peer-response-bytes-length-mismatch",
            );
            this.destroy();
          }
        }
        break;

      case PeerCommandType.SegmentDataSendingCompleted: {
        const downloadingContext = this.downloadingContext;

        if (!downloadingContext?.isSegmentDataCommandReceived) return;

        const { request, controls } = downloadingContext;

        const isWrongSegment =
          downloadingContext.request.segment.externalId !== command.i;

        if (isWrongSegment) {
          request.clearLoadedBytes();
          this.cancelSegmentDownloading("peer-protocol-violation");
          this.destroy();
          return;
        }

        const isWrongBytes = request.loadedBytes !== request.totalBytes;

        if (isWrongBytes) {
          request.clearLoadedBytes();
          this.cancelSegmentDownloading("peer-response-bytes-length-mismatch");
          this.destroy();
          return;
        }

        const isValid =
          (await this.settings.validateP2PSegment?.(
            request.segment.url,
            request.segment.byteRange,
          )) ?? true;

        if (this.downloadingContext !== downloadingContext) return;

        if (!isValid) {
          request.clearLoadedBytes();
          this.cancelSegmentDownloading("p2p-segment-validation-failed");
          this.destroy();
          return;
        }

        this.downloadingErrors = [];
        controls.completeOnSuccess();
        this.downloadingContext = undefined;
        break;
      }

      case PeerCommandType.SegmentAbsent:
        if (this.downloadingContext?.request.segment.externalId === command.i) {
          this.cancelSegmentDownloading("peer-segment-absent");
          this.loadedSegments.delete(command.i);
        }
        break;

      case PeerCommandType.CancelSegmentRequest:
        this.peerProtocol.stopUploadingSegmentData();
        break;
    }
  };

  protected onSegmentChunkReceived = (chunk: Uint8Array) => {
    if (!this.downloadingContext?.isSegmentDataCommandReceived) return;

    const { request, controls } = this.downloadingContext;

    const isOverflow =
      request.totalBytes !== undefined &&
      request.loadedBytes + chunk.byteLength > request.totalBytes;

    if (isOverflow) {
      request.clearLoadedBytes();
      this.cancelSegmentDownloading("peer-response-bytes-length-mismatch");
      this.destroy();
      return;
    }

    controls.addLoadedChunk(chunk);
  };

  downloadSegment(segmentRequest: Request) {
    if (this.downloadingContext) {
      throw new Error("Some segment already is downloading");
    }
    this.downloadingContext = {
      request: segmentRequest,
      isSegmentDataCommandReceived: false,
      controls: segmentRequest.start(
        { downloadSource: "p2p", peerId: this.id },
        {
          notReceivingBytesTimeoutMs:
            this.settings.p2pNotReceivingBytesTimeoutMs,
          abort: (error) => {
            if (!this.downloadingContext) return;
            const { request } = this.downloadingContext;

            this.sendCancelSegmentRequestCommand(request.segment);
            this.downloadingErrors.push(error);
            this.downloadingContext = undefined;

            const timeoutErrors = this.downloadingErrors.filter(
              (error) => error.type === "bytes-receiving-timeout",
            );

            if (timeoutErrors.length >= this.settings.p2pErrorRetries) {
              this.destroy();
            }
          },
        },
      ),
    };
    const command: Command.PeerRequestSegmentCommand = {
      c: PeerCommandType.SegmentRequest,
      i: segmentRequest.segment.externalId,
    };
    if (segmentRequest.loadedBytes) command.b = segmentRequest.loadedBytes;
    this.peerProtocol.sendCommand(command);
  }

  async uploadSegmentData(segment: Segment, data: ArrayBuffer) {
    const { externalId } = segment;
    this.logger(`send segment ${segment.externalId} to ${this.id}`);
    const command: Command.PeerSendSegmentCommand = {
      c: PeerCommandType.SegmentData,
      i: externalId,
      s: data.byteLength,
    };
    this.peerProtocol.sendCommand(command);
    try {
      await this.peerProtocol.splitSegmentDataToChunksAndUploadAsync(
        data as Uint8Array,
      );
      this.sendSegmentDataSendingCompletedCommand(segment);
      this.logger(`segment ${externalId} has been sent to ${this.id}`);
    } catch (err) {
      this.logger(`cancel segment uploading ${externalId}`);
    }
  }

  private cancelSegmentDownloading(type: PeerRequestErrorType) {
    if (!this.downloadingContext) return;
    const { request, controls } = this.downloadingContext;
    const { segment } = request;
    this.logger(`cancel segment request ${segment.externalId} (${type})`);
    const error = new RequestError(type);
    controls.abortOnError(error);
    this.downloadingContext = undefined;
    this.downloadingErrors.push(error);
  }

  sendSegmentsAnnouncementCommand(
    loadedSegmentsIds: number[],
    httpLoadingSegmentsIds: number[],
  ) {
    const command: Command.PeerSegmentAnnouncementCommand = {
      c: PeerCommandType.SegmentsAnnouncement,
      p: httpLoadingSegmentsIds,
      l: loadedSegmentsIds,
    };
    this.peerProtocol.sendCommand(command);
  }

  sendSegmentAbsentCommand(segmentExternalId: number) {
    this.peerProtocol.sendCommand({
      c: PeerCommandType.SegmentAbsent,
      i: segmentExternalId,
    });
  }

  private sendCancelSegmentRequestCommand(segment: Segment) {
    this.peerProtocol.sendCommand({
      c: PeerCommandType.CancelSegmentRequest,
      i: segment.externalId,
    });
  }

  private sendSegmentDataSendingCompletedCommand(segment: Segment) {
    this.peerProtocol.sendCommand({
      c: PeerCommandType.SegmentDataSendingCompleted,
      i: segment.externalId,
    });
  }

  private onPeerConnectionClosed = () => {
    this.destroy();
  };

  private onConnectionError = (error: { code: string }) => {
    this.logger(`peer connection error ${this.id} %O`, error);

    if (error.code === "ERR_DATA_CHANNEL") {
      this.destroy();
    }
  };

  destroy = () => {
    this.cancelSegmentDownloading("peer-closed");
    this.connection.destroy();
    this.eventHandlers.onPeerClosed(this);
    this.onPeerClosed(this.id);
    this.logger(`peer closed ${this.id}`);
  };

  static getPeerIdFromConnection(connection: PeerConnection) {
    return Utils.hexToUtf8(connection.id);
  }
}
