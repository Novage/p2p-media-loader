import { PeerConnection } from "bittorrent-tracker";
import { PeerInterface, PeerSettings } from "./peer-interface";
import {
  Request,
  RequestControls,
  RequestError,
  PeerRequestErrorType,
  RequestInnerErrorType,
} from "../request";
import * as Command from "./commands";
import { Segment } from "../types";
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

export class Peer {
  readonly id: string;
  private readonly peerInterface;
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

  constructor(
    connection: PeerConnection,
    private readonly eventHandlers: PeerEventHandlers,
    private readonly settings: PeerSettings
  ) {
    this.id = Peer.getPeerIdFromConnection(connection);
    this.peerInterface = new PeerInterface(connection, settings, {
      onSegmentChunkReceived: this.onSegmentChunkReceived,
      onCommandReceived: this.onCommandReceived,
      onDestroy: this.destroy,
    });
  }

  get downloadingSegment(): Segment | undefined {
    return this.downloadingContext?.request.segment;
  }

  getSegmentStatus(segment: Segment): "loaded" | "http-loading" | undefined {
    const { externalId } = segment;
    if (this.loadedSegments.has(externalId)) return "loaded";
    if (this.httpLoadingSegments.has(externalId)) return "http-loading";
  }

  private onCommandReceived = (command: Command.PeerCommand) => {
    switch (command.c) {
      case PeerCommandType.SegmentsAnnouncement:
        this.loadedSegments = new Set(command.l);
        this.httpLoadingSegments = new Set(command.p);
        break;

      case PeerCommandType.SegmentRequest:
        this.peerInterface.stopUploadingSegmentData();
        this.eventHandlers.onSegmentRequested(this, command.i, command.b);
        break;

      case PeerCommandType.SegmentData:
        {
          if (!this.downloadingContext) break;
          this.downloadingContext.isSegmentDataCommandReceived = true;
          const { request, controls } = this.downloadingContext;
          controls.firstBytesReceived();
          if (
            request.segment.externalId === command.i &&
            request.totalBytes === undefined
          ) {
            request.setTotalBytes(command.s);
          }
        }
        break;

      case PeerCommandType.SegmentAbsent:
        if (this.downloadingContext?.request.segment.externalId === command.i) {
          this.cancelSegmentDownloading("peer-segment-absent");
          this.loadedSegments.delete(command.i);
        }
        break;

      case PeerCommandType.CancelSegmentRequest:
        this.peerInterface.stopUploadingSegmentData();
        break;
    }
  };

  protected onSegmentChunkReceived = (chunk: Uint8Array) => {
    if (!this.downloadingContext?.isSegmentDataCommandReceived) return;
    const { request, controls } = this.downloadingContext;
    controls.addLoadedChunk(chunk);

    if (request.totalBytes === undefined) return;
    if (request.loadedBytes === request.totalBytes) {
      controls.completeOnSuccess();
      this.downloadingContext = undefined;
    } else if (request.loadedBytes > request.totalBytes) {
      request.clearLoadedBytes();
      this.cancelSegmentDownloading("peer-response-bytes-mismatch");
    }
  };

  downloadSegment(segmentRequest: Request) {
    if (this.downloadingContext) {
      throw new Error("Some segment already is downloading");
    }
    this.downloadingContext = {
      request: segmentRequest,
      isSegmentDataCommandReceived: false,
      controls: segmentRequest.start(
        { type: "p2p", peerId: this.id },
        {
          notReceivingBytesTimeoutMs:
            this.settings.p2pNotReceivingBytesTimeoutMs,
          abort: (error) => {
            if (!this.downloadingContext) return;
            const { request } = this.downloadingContext;
            this.sendCancelSegmentRequestCommand(request.segment);
            this.downloadingContext = undefined;
            this.downloadingErrors.push(error);

            const timeoutErrors = this.downloadingErrors.filter(
              (error) => error.type === "bytes-receiving-timeout"
            );
            const { maxPeerNotReceivingBytesTimeoutErrors } = this.settings;
            if (timeoutErrors.length >= maxPeerNotReceivingBytesTimeoutErrors) {
              this.peerInterface.destroy();
            }
          },
        }
      ),
    };
    const command: Command.PeerRequestSegmentCommand = {
      c: PeerCommandType.SegmentRequest,
      i: segmentRequest.segment.externalId,
    };
    if (segmentRequest.loadedBytes) command.b = segmentRequest.loadedBytes;
    this.peerInterface.sendCommand(command);
  }

  async uploadSegmentData(segmentExternalId: number, data: ArrayBuffer) {
    this.logger(`send segment ${segmentExternalId} to ${this.id}`);
    const command: Command.PeerSendSegmentCommand = {
      c: PeerCommandType.SegmentData,
      i: segmentExternalId,
      s: data.byteLength,
    };
    this.peerInterface.sendCommand(command);
    try {
      await this.peerInterface.splitSegmentDataToChunksAndUploadAsync(
        data as Uint8Array
      );
      this.logger(`segment ${segmentExternalId} has been sent to ${this.id}`);
    } catch (err) {
      this.logger(`cancel segment uploading ${segmentExternalId}`);
    }
  }

  private cancelSegmentDownloading(type: PeerRequestErrorType) {
    if (!this.downloadingContext) return;
    const { request, controls } = this.downloadingContext;
    if (type === "peer-response-bytes-mismatch") {
      this.sendCancelSegmentRequestCommand(request.segment);
    }
    const { segment } = request;
    this.logger(`cancel segment request ${segment.externalId} (${type})`);
    const error = new RequestError(type);
    controls.abortOnError(error);
    this.downloadingContext = undefined;
    this.downloadingErrors.push(error);
  }

  sendSegmentsAnnouncementCommand(
    loadedSegmentsIds: number[],
    httpLoadingSegmentsIds: number[]
  ) {
    const command: Command.PeerSegmentAnnouncementCommand = {
      c: PeerCommandType.SegmentsAnnouncement,
      p: httpLoadingSegmentsIds,
      l: loadedSegmentsIds,
    };
    this.peerInterface.sendCommand(command);
  }

  sendSegmentAbsentCommand(segmentExternalId: number) {
    this.peerInterface.sendCommand({
      c: PeerCommandType.SegmentAbsent,
      i: segmentExternalId,
    });
  }

  private sendCancelSegmentRequestCommand(segment: Segment) {
    this.peerInterface.sendCommand({
      c: PeerCommandType.CancelSegmentRequest,
      i: segment.externalId,
    });
  }

  destroy = () => {
    this.cancelSegmentDownloading("peer-closed");
    this.eventHandlers.onPeerClosed(this);
    this.logger(`peer closed ${this.id}`);
  };

  static getPeerIdFromConnection(connection: PeerConnection) {
    return Utils.hexToUtf8(connection.id);
  }
}
