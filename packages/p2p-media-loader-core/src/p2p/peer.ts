import { PeerConnection } from "bittorrent-tracker";
import debug from "debug";
import { Request, RequestControls } from "../requests/request.js";
import {
  CoreEventMap,
  PeerRequestErrorType,
  RequestError,
  RequestAbortErrorType,
  SegmentWithStream,
} from "../types.js";
import * as Utils from "../utils/utils.js";
import * as Command from "./commands/index.js";
import { PeerProtocol, PeerConfig } from "./peer-protocol.js";
import { EventTarget } from "../utils/event-target.js";

const { PeerCommandType } = Command;
type PeerEventHandlers = {
  onPeerClosed: (peer: Peer) => void;
  onSegmentRequested: (
    peer: Peer,
    segmentId: number,
    requestId: number,
    byteFrom?: number,
  ) => void;
  onSegmentsAnnouncement: () => void;
};

export class Peer {
  readonly id: string;
  private readonly peerProtocol;
  private downloadingContext?: {
    request: Request;
    controls: RequestControls;
    isSegmentDataCommandReceived: boolean;
    requestId: number;
  };
  private loadedSegments = new Set<number>();
  private httpLoadingSegments = new Set<number>();
  private downloadingErrors: RequestError<
    PeerRequestErrorType | RequestAbortErrorType
  >[] = [];
  private logger = debug("p2pml-core:peer");
  private readonly onPeerClosed: CoreEventMap["onPeerClose"];

  constructor(
    private readonly connection: PeerConnection,
    private readonly eventHandlers: PeerEventHandlers,
    private readonly peerConfig: PeerConfig,
    eventTarget: EventTarget<CoreEventMap>,
  ) {
    this.onPeerClosed = eventTarget.getEventDispatcher("onPeerClose");

    this.id = Peer.getPeerIdFromConnection(connection);
    this.peerProtocol = new PeerProtocol(
      connection,
      peerConfig,
      {
        onSegmentChunkReceived: this.onSegmentChunkReceived,
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onCommandReceived: this.onCommandReceived,
      },
      eventTarget,
    );
    eventTarget.getEventDispatcher("onPeerConnect")({
      peerId: this.id,
    });

    connection.on("error", this.onConnectionError);
    connection.on("close", this.onPeerConnectionClosed);
    connection.on("end", this.onPeerConnectionClosed);
    connection.on("finish", this.onPeerConnectionClosed);
  }

  get downloadingSegment(): SegmentWithStream | undefined {
    return this.downloadingContext?.request.segment;
  }

  getSegmentStatus(
    segment: SegmentWithStream,
  ): "loaded" | "http-loading" | undefined {
    const { externalId } = segment;
    if (this.loadedSegments.has(externalId)) return "loaded";
    if (this.httpLoadingSegments.has(externalId)) return "http-loading";
  }

  private onCommandReceived = async (command: Command.PeerCommand) => {
    switch (command.c) {
      case PeerCommandType.SegmentsAnnouncement:
        this.loadedSegments = new Set(command.l);
        this.httpLoadingSegments = new Set(command.p);
        this.eventHandlers.onSegmentsAnnouncement();
        break;

      case PeerCommandType.SegmentRequest:
        this.peerProtocol.stopUploadingSegmentData();
        this.eventHandlers.onSegmentRequested(
          this,
          command.i,
          command.r,
          command.b,
        );
        break;

      case PeerCommandType.SegmentData:
        {
          if (!this.downloadingContext) break;
          if (this.downloadingContext.isSegmentDataCommandReceived) break;

          const { request, controls, requestId } = this.downloadingContext;
          if (
            request.segment.externalId !== command.i ||
            requestId !== command.r
          ) {
            break;
          }

          this.downloadingContext.isSegmentDataCommandReceived = true;
          controls.firstBytesReceived();

          if (request.totalBytes === undefined) {
            request.setTotalBytes(command.s);
          } else if (request.totalBytes - request.loadedBytes !== command.s) {
            request.clearLoadedBytes();
            this.sendCancelSegmentRequestCommand(request.segment, requestId);
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
          downloadingContext.request.segment.externalId !== command.i ||
          downloadingContext.requestId !== command.r;

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
          (await this.peerConfig.validateP2PSegment?.(
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
        if (
          this.downloadingContext?.request.segment.externalId === command.i &&
          this.downloadingContext?.requestId === command.r
        ) {
          this.cancelSegmentDownloading("peer-segment-absent");
          this.loadedSegments.delete(command.i);
        }
        break;

      case PeerCommandType.CancelSegmentRequest:
        const uploadingRequestId = this.peerProtocol.getUploadingRequestId();

        if (uploadingRequestId !== command.r) break;

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
      requestId: Math.floor(Math.random() * 1000),
      isSegmentDataCommandReceived: false,
      controls: segmentRequest.start(
        { downloadSource: "p2p", peerId: this.id },
        {
          notReceivingBytesTimeoutMs:
            this.peerConfig.p2pNotReceivingBytesTimeoutMs,
          abort: (error) => {
            if (!this.downloadingContext) return;
            const { request, requestId } = this.downloadingContext;
            this.sendCancelSegmentRequestCommand(request.segment, requestId);
            this.downloadingErrors.push(error);
            this.downloadingContext = undefined;

            const timeoutErrors = this.downloadingErrors.filter(
              (error) => error.type === "bytes-receiving-timeout",
            );

            if (timeoutErrors.length >= this.peerConfig.p2pErrorRetries) {
              this.destroy();
            }
          },
        },
      ),
    };
    const command: Command.PeerRequestSegmentCommand = {
      c: PeerCommandType.SegmentRequest,
      r: this.downloadingContext.requestId,
      i: segmentRequest.segment.externalId,
    };
    if (segmentRequest.loadedBytes) command.b = segmentRequest.loadedBytes;
    this.peerProtocol.sendCommand(command);
  }

  async uploadSegmentData(
    segment: SegmentWithStream,
    requestId: number,
    data: ArrayBuffer,
  ) {
    const { externalId } = segment;
    this.logger(`send segment ${segment.externalId} to ${this.id}`);
    const command: Command.PeerSendSegmentCommand = {
      c: PeerCommandType.SegmentData,
      i: externalId,
      r: requestId,
      s: data.byteLength,
    };
    this.peerProtocol.sendCommand(command);
    try {
      await this.peerProtocol.splitSegmentDataToChunksAndUploadAsync(
        data as Uint8Array,
        requestId,
      );
      this.sendSegmentDataSendingCompletedCommand(segment, requestId);
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

  sendSegmentAbsentCommand(segmentExternalId: number, requestId: number) {
    this.peerProtocol.sendCommand({
      c: PeerCommandType.SegmentAbsent,
      i: segmentExternalId,
      r: requestId,
    });
  }

  private sendCancelSegmentRequestCommand(
    segment: SegmentWithStream,
    requestId: number,
  ) {
    this.peerProtocol.sendCommand({
      c: PeerCommandType.CancelSegmentRequest,
      i: segment.externalId,
      r: requestId,
    });
  }

  private sendSegmentDataSendingCompletedCommand(
    segment: SegmentWithStream,
    requestId: number,
  ) {
    this.peerProtocol.sendCommand({
      c: PeerCommandType.SegmentDataSendingCompleted,
      r: requestId,
      i: segment.externalId,
    });
  }

  private onPeerConnectionClosed = () => {
    this.destroy();
  };

  private onConnectionError = (error: Error) => {
    this.logger(`peer connection error ${this.id} %O`, error);

    const code = (error as { code?: string }).code;

    if (code === "ERR_DATA_CHANNEL") {
      this.destroy();
    } else if (code === "ERR_CONNECTION_FAILURE") {
      this.destroy();
    }
  };

  destroy = () => {
    this.cancelSegmentDownloading("peer-closed");
    this.connection.destroy();
    this.eventHandlers.onPeerClosed(this);
    this.onPeerClosed({
      peerId: this.id,
    });
    this.logger(`peer closed ${this.id}`);
  };

  static getPeerIdFromConnection(connection: PeerConnection) {
    return Utils.hexToUtf8(connection.id);
  }
}
