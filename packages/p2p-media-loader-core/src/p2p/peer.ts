import { PeerConnection } from "bittorrent-tracker";
import { PeerBase, PeerSettings } from "./peer-base";
import {
  Request,
  RequestControls,
  RequestError,
  PeerRequestErrorType,
} from "../request";
import * as Command from "./commands";
import { Segment } from "../types";

const { PeerCommandType } = Command;
type PeerEventHandlers = {
  onPeerClosed: (peer: Peer) => void;
  onSegmentRequested: (
    peer: Peer,
    segmentId: number,
    byteFrom?: number
  ) => void;
};

export class Peer extends PeerBase {
  private requestContext?: { request: Request; controls: RequestControls };
  private loadedSegments = new Set<number>();
  private httpLoadingSegments = new Set<number>();

  constructor(
    connection: PeerConnection,
    private readonly eventHandlers: PeerEventHandlers,
    settings: PeerSettings
  ) {
    super(connection, settings);
  }

  get downloadingSegment(): Segment | undefined {
    return this.requestContext?.request.segment;
  }

  getSegmentStatus(segment: Segment): "loaded" | "http-loading" | undefined {
    const { externalId } = segment;
    if (this.loadedSegments.has(externalId)) return "loaded";
    if (this.httpLoadingSegments.has(externalId)) return "http-loading";
  }

  protected receiveCommand(command: Command.PeerCommand) {
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
          this.cancelSegmentDownloading("peer-segment-absent");
          this.loadedSegments.delete(command.i);
        }
        break;

      case PeerCommandType.CancelSegmentRequest:
        this.cancelDataUploading();
        break;
    }
  }

  protected receiveSegmentChunk(chunk: Uint8Array): void {
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
      this.cancelSegmentDownloading("peer-response-bytes-mismatch");
    }
  }

  downloadSegment(segmentRequest: Request) {
    if (this.requestContext) {
      throw new Error("Segment already is downloading");
    }
    this.requestContext = {
      request: segmentRequest,
      controls: segmentRequest.start(
        { type: "p2p", peerId: this.id },
        {
          abort: this.abortSegmentDownloading,
          notReceivingBytesTimeoutMs:
            this.settings.p2pNotReceivingBytesTimeoutMs,
        }
      ),
    };
    const command: Command.PeerRequestSegmentCommand = {
      c: PeerCommandType.SegmentRequest,
      i: segmentRequest.segment.externalId,
    };
    if (segmentRequest.loadedBytes) command.b = segmentRequest.loadedBytes;
    this.sendCommand(command);
  }

  private abortSegmentDownloading = () => {
    if (!this.requestContext) return;
    const { request } = this.requestContext;
    this.sendCancelSegmentRequestCommand(request.segment);
    this.requestContext = undefined;
  };

  async uploadSegmentData(segmentExternalId: number, data: ArrayBuffer) {
    this.logger(`send segment ${segmentExternalId} to ${this.id}`);
    const command: Command.PeerSendSegmentCommand = {
      c: PeerCommandType.SegmentData,
      i: segmentExternalId,
      s: data.byteLength,
    };
    this.sendCommand(command);
    try {
      await this.splitToChunksAndUploadAsynchronously(data as Uint8Array);
      this.logger(`segment ${segmentExternalId} has been sent to ${this.id}`);
    } catch (err) {
      this.logger(`cancel segment uploading ${segmentExternalId}`);
    }
  }

  private cancelSegmentDownloading(type: PeerRequestErrorType) {
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

  sendSegmentsAnnouncementCommand(
    loadedSegmentsIds: number[],
    httpLoadingSegmentsIds: number[]
  ) {
    const command: Command.PeerSegmentAnnouncementCommand = {
      c: PeerCommandType.SegmentsAnnouncement,
      p: httpLoadingSegmentsIds,
      l: loadedSegmentsIds,
    };
    this.sendCommand(command);
  }

  sendSegmentAbsentCommand(segmentExternalId: number) {
    this.sendCommand({
      c: PeerCommandType.SegmentAbsent,
      i: segmentExternalId,
    });
  }

  private sendCancelSegmentRequestCommand(segment: Segment) {
    this.sendCommand({
      c: PeerCommandType.CancelSegmentRequest,
      i: segment.externalId,
    });
  }

  destroy() {
    super.destroy();
    this.cancelSegmentDownloading("peer-closed");
    this.eventHandlers.onPeerClosed(this);
  }
}
