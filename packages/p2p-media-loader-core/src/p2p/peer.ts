import debug from "debug";
import { Request, RequestControls } from "../requests/request.js";
import {
  CoreEventMap,
  PeerRequestErrorType,
  RequestError,
  RequestAbortErrorType,
  SegmentWithStream,
} from "../types.js";
import * as Command from "./commands/index.js";
import { PeerProtocol, PeerConfig } from "./peer-protocol.js";
import { EventTarget } from "../utils/event-target.js";
import { BandwidthCalculator } from "../bandwidth-calculator.js";
const { PeerCommandType } = Command;
type PeerEventHandlers = {
  onSegmentRequested: (
    peer: Peer,
    segmentId: number,
    requestId: number,
    byteFrom?: number,
  ) => void;
  onSegmentsAnnouncement: () => void;
};

export class Peer {
  readonly #peerProtocol;
  #downloadingContext?: {
    request: Request;
    controls: RequestControls;
    isSegmentDataCommandReceived: boolean;
    requestId: number;
  };
  #loadedSegments = new Set<number>();
  #httpLoadingSegments = new Set<number>();
  #downloadingErrors: RequestError<
    PeerRequestErrorType | RequestAbortErrorType
  >[] = [];
  readonly #bandwidthCalculator = new BandwidthCalculator();
  #cachedDownloadBandwidth = { value: 0, timestamp: 0 };
  #logger = debug("p2pml-core:peer");
  #nextRequestId = 0;
  #isDestroyed = false;

  readonly #closeConnection: (error?: string) => void;
  readonly #eventHandlers: PeerEventHandlers;
  readonly #peerConfig: PeerConfig;

  // Required to suppress TypeScript error: Unnecessary conditional, value is always falsy
  #checkIsDestroyed() {
    return this.#isDestroyed;
  }

  constructor(
    public readonly id: string,
    readonly channel: RTCDataChannel,
    closeConnection: (error?: string) => void,
    eventHandlers: PeerEventHandlers,
    peerConfig: PeerConfig,
    readonly eventTarget: EventTarget<CoreEventMap>,
  ) {
    this.#closeConnection = closeConnection;
    this.#eventHandlers = eventHandlers;
    this.#peerConfig = peerConfig;

    this.#peerProtocol = new PeerProtocol(
      channel,
      peerConfig,
      {
        onSegmentChunkReceived: this.onSegmentChunkReceived,
        onCommandReceived: (command) =>
          void this.#onCommandReceived(command).catch((error: unknown) => {
            this.#logger("error processing command %O: %O", command, error);
          }),
      },
      eventTarget,
      id,
    );
  }

  get downloadingSegment(): SegmentWithStream | undefined {
    return this.#downloadingContext?.request.segment;
  }

  get downloadBandwidth(): number {
    const now = performance.now();
    // Cache the array iteration math for 1000ms to preserve O(1) hot path efficiency during rapid queue segment evaluations
    if (now - this.#cachedDownloadBandwidth.timestamp > 1000) {
      // Uses a 15-second tracking window to calculate a moving average of the peer's throughput speed
      this.#cachedDownloadBandwidth.value =
        this.#bandwidthCalculator.getBandwidthLoadingOnly(15);
      this.#cachedDownloadBandwidth.timestamp = now;
    }
    return this.#cachedDownloadBandwidth.value;
  }

  getSegmentStatus(
    segment: SegmentWithStream,
  ): "loaded" | "http-loading" | undefined {
    const { externalId } = segment;
    if (this.#loadedSegments.has(externalId)) return "loaded";
    if (this.#httpLoadingSegments.has(externalId)) return "http-loading";
  }

  #onCommandReceived = async (command: Command.PeerCommand) => {
    switch (command.c) {
      case PeerCommandType.SegmentsAnnouncement:
        this.#loadedSegments = new Set(command.l);
        this.#httpLoadingSegments = new Set(command.p);
        this.#eventHandlers.onSegmentsAnnouncement();
        break;

      case PeerCommandType.SegmentRequest:
        this.#peerProtocol.stopUploadingSegmentData();
        this.#eventHandlers.onSegmentRequested(
          this,
          command.i,
          command.r,
          command.b,
        );
        break;

      case PeerCommandType.SegmentData:
        {
          if (!this.#downloadingContext) break;
          if (this.#downloadingContext.isSegmentDataCommandReceived) break;

          const { request, controls, requestId } = this.#downloadingContext;
          if (
            request.segment.externalId !== command.i ||
            requestId !== command.r
          ) {
            break;
          }

          this.#downloadingContext.isSegmentDataCommandReceived = true;
          controls.firstBytesReceived();

          if (request.totalBytes === undefined) {
            request.setTotalBytes(command.s);
          } else if (request.totalBytes - request.loadedBytes !== command.s) {
            request.clearLoadedBytes();
            this.#sendCancelSegmentRequestCommand(request.segment, requestId);
            this.#cancelSegmentDownloading(
              "peer-response-bytes-length-mismatch",
            );
            this.destroy(false, "Peer response bytes length mismatch");
          }
        }
        break;

      case PeerCommandType.SegmentDataSendingCompleted: {
        const downloadingContext = this.#downloadingContext;

        if (!downloadingContext?.isSegmentDataCommandReceived) return;

        const { request, controls } = downloadingContext;

        const isWrongSegment =
          downloadingContext.request.segment.externalId !== command.i ||
          downloadingContext.requestId !== command.r;

        if (isWrongSegment) {
          request.clearLoadedBytes();
          this.#cancelSegmentDownloading("peer-protocol-violation");
          this.destroy(false, "Peer protocol violation");
          return;
        }

        const isWrongBytes = request.loadedBytes !== request.totalBytes;

        if (isWrongBytes) {
          request.clearLoadedBytes();
          this.#cancelSegmentDownloading("peer-response-bytes-length-mismatch");
          this.destroy(false, "Peer response bytes length mismatch");
          return;
        }

        const isValid = await request.validateData(
          this.#peerConfig.validateP2PSegment,
        );

        if (this.#isDestroyed) return;
        if (this.#downloadingContext !== downloadingContext) return;

        if (!isValid) {
          request.clearLoadedBytes();
          this.#cancelSegmentDownloading("p2p-segment-validation-failed");
          this.destroy(false, "P2P segment validation failed");
          return;
        }

        this.#downloadingErrors = [];
        controls.completeOnSuccess();
        this.#bandwidthCalculator.stopLoading();
        this.#downloadingContext = undefined;
        break;
      }

      case PeerCommandType.SegmentAbsent:
        if (
          this.#downloadingContext?.request.segment.externalId === command.i &&
          this.#downloadingContext.requestId === command.r
        ) {
          this.#cancelSegmentDownloading("peer-segment-absent");
          this.#loadedSegments.delete(command.i);
        }
        break;

      case PeerCommandType.CancelSegmentRequest: {
        const uploadingRequestId = this.#peerProtocol.getUploadingRequestId();

        if (uploadingRequestId !== command.r) break;

        this.#peerProtocol.stopUploadingSegmentData();
        break;
      }
    }
  };

  protected onSegmentChunkReceived = (chunk: Uint8Array) => {
    if (!this.#downloadingContext?.isSegmentDataCommandReceived) return;

    const { request, controls } = this.#downloadingContext;

    const isOverflow =
      request.totalBytes !== undefined &&
      request.loadedBytes + chunk.byteLength > request.totalBytes;

    if (isOverflow) {
      request.clearLoadedBytes();
      this.#cancelSegmentDownloading("peer-response-bytes-length-mismatch");
      this.destroy(false, "Peer response bytes length mismatch");
      return;
    }

    this.#bandwidthCalculator.addBytes(chunk.byteLength);
    this.#cachedDownloadBandwidth.timestamp = 0; // invalidate cache
    controls.addLoadedChunk(chunk);
  };

  downloadSegment(segmentRequest: Request) {
    if (this.#isDestroyed) return;
    if (this.#downloadingContext) {
      throw new Error("Some segment already is downloading");
    }

    const completed = segmentRequest.tryCompleteByLoadedBytes(
      { downloadSource: "p2p", peerId: this.id },
      {
        notReceivingBytesTimeoutMs:
          this.#peerConfig.p2pNotReceivingBytesTimeoutMs,
        abort: () => void 0,
      },
      this.#peerConfig.validateP2PSegment,
      "p2p-segment-validation-failed",
    );

    if (completed) return;

    this.#bandwidthCalculator.startLoading();
    this.#downloadingContext = {
      request: segmentRequest,
      requestId: (this.#nextRequestId = (this.#nextRequestId + 1) % 1000),
      isSegmentDataCommandReceived: false,
      controls: segmentRequest.start(
        { downloadSource: "p2p", peerId: this.id },
        {
          notReceivingBytesTimeoutMs:
            this.#peerConfig.p2pNotReceivingBytesTimeoutMs,
          abort: (error) => {
            if (!this.#downloadingContext) return;
            const { request, requestId } = this.#downloadingContext;
            this.#sendCancelSegmentRequestCommand(request.segment, requestId);
            this.#downloadingErrors.push(error);
            this.#bandwidthCalculator.stopLoading();
            if (error.type !== "abort") {
              this.#bandwidthCalculator.clear();
              this.#cachedDownloadBandwidth.timestamp = 0;
              this.#logger(`cleared bandwidth history due to ${error.type}`);
            }
            this.#downloadingContext = undefined;

            const timeoutErrors = this.#downloadingErrors.filter(
              (error) => error.type === "bytes-receiving-timeout",
            );

            if (timeoutErrors.length >= this.#peerConfig.p2pErrorRetries) {
              this.destroy(false, "Too many timeout errors");
            }
          },
        },
      ),
    };
    const command: Command.PeerRequestSegmentCommand = {
      c: PeerCommandType.SegmentRequest,
      r: this.#downloadingContext.requestId,
      i: segmentRequest.segment.externalId,
    };
    if (segmentRequest.loadedBytes) command.b = segmentRequest.loadedBytes;
    this.#peerProtocol.sendCommand(command);
  }

  async uploadSegmentData(
    segment: SegmentWithStream,
    requestId: number,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments
    data: ArrayBuffer | ArrayBufferView<ArrayBuffer>,
  ) {
    if (this.#isDestroyed) return;
    const { externalId } = segment;
    this.#logger(
      `send segment ${segment.externalId} to ${this.id} (byteLength: ${data.byteLength})`,
    );
    const command: Command.PeerSendSegmentCommand = {
      c: PeerCommandType.SegmentData,
      i: externalId,
      r: requestId,
      s: data.byteLength,
    };
    this.#peerProtocol.sendCommand(command);
    try {
      await this.#peerProtocol.splitSegmentDataToChunksAndUploadAsync(
        data,
        requestId,
      );
      if (this.#checkIsDestroyed()) return;
      this.#sendSegmentDataSendingCompletedCommand(segment, requestId);
      this.#logger(`segment ${externalId} has been sent to ${this.id}`);
    } catch {
      this.#logger(`cancel segment uploading ${externalId}`);
    }
  }

  #cancelSegmentDownloading(type: PeerRequestErrorType) {
    if (!this.#downloadingContext) return;
    const { request, controls } = this.#downloadingContext;
    const { segment } = request;
    this.#logger(`cancel segment request ${segment.externalId} (${type})`);
    const error = new RequestError(type);
    controls.abortOnError(error);
    this.#bandwidthCalculator.stopLoading();
    this.#bandwidthCalculator.clear();
    this.#cachedDownloadBandwidth.timestamp = 0;
    this.#logger(`cleared bandwidth history due to ${error.type}`);
    this.#downloadingContext = undefined;
    this.#downloadingErrors.push(error);
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
    this.#peerProtocol.sendCommand(command);
  }

  sendSegmentAbsentCommand(segmentExternalId: number, requestId: number) {
    this.#peerProtocol.sendCommand({
      c: PeerCommandType.SegmentAbsent,
      i: segmentExternalId,
      r: requestId,
    });
  }

  #sendCancelSegmentRequestCommand(
    segment: SegmentWithStream,
    requestId: number,
  ) {
    this.#peerProtocol.sendCommand({
      c: PeerCommandType.CancelSegmentRequest,
      i: segment.externalId,
      r: requestId,
    });
  }

  #sendSegmentDataSendingCompletedCommand(
    segment: SegmentWithStream,
    requestId: number,
  ) {
    this.#peerProtocol.sendCommand({
      c: PeerCommandType.SegmentDataSendingCompleted,
      r: requestId,
      i: segment.externalId,
    });
  }

  destroy = (isConnectionClosed = false, error?: string) => {
    if (this.#isDestroyed) return;
    this.#isDestroyed = true;

    this.#cancelSegmentDownloading("peer-closed");
    this.#peerProtocol.destroy();

    if (!isConnectionClosed) {
      this.#closeConnection(error);
    }
    this.#logger(`peer closed ${this.id}`);
  };
}
