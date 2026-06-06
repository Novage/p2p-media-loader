import debug from "debug";
import { Request, RequestControls } from "../requests/request.js";
import {
  CoreEventMap,
  PeerRequestErrorType,
  RequestError,
  SegmentWithStream,
  PeerError,
  PeerErrorType,
  PeerWarning,
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
  onWarning: (warning: PeerWarning) => void;
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
  #consecutiveTimeouts = 0;
  readonly #bandwidthCalculator = new BandwidthCalculator();
  #cachedDownloadBandwidth = { value: 0, timestamp: 0 };
  #logger = debug("p2pml-core:peer");
  #nextRequestId = 0;
  #latestRequestedUploadRequestId?: number;
  #isDestroyed = false;
  readonly connectedAt = performance.now();

  readonly #closeConnection: (error?: PeerError) => void;
  readonly #eventHandlers: PeerEventHandlers;
  readonly #peerConfig: PeerConfig;

  get isDestroyed() {
    return this.#isDestroyed;
  }

  constructor(
    public readonly id: string,
    readonly channel: RTCDataChannel,
    closeConnection: (error?: PeerError) => void,
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
        onSegmentChunkReceived: this.#onSegmentChunkReceived,
        onCommandReceived: (command) =>
          void this.#onCommandReceived(command).catch((error: unknown) => {
            this.#logger("error processing command %O: %O", command, error);
            this.destroy(
              false,
              new PeerError(
                "protocol-violation",
                error instanceof Error
                  ? error.message
                  : "Error processing command",
                error,
              ),
            );
          }),
        onProtocolError: (error) => {
          this.destroy(
            false,
            new PeerError(
              "protocol-violation",
              error instanceof Error ? error.message : "Protocol error",
              error,
            ),
          );
        },
      },
      eventTarget,
      id,
    );
  }

  get downloadingSegment(): SegmentWithStream | undefined {
    return this.#downloadingContext?.request.segment;
  }

  get isUploadingSegment(): boolean {
    return this.#peerProtocol.getUploadingRequestId() !== undefined;
  }

  getDownloadBandwidth(): number {
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
        this.#latestRequestedUploadRequestId = command.r;
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
            request.setTotalBytes(request.loadedBytes + command.s);
          } else if (request.totalBytes - request.loadedBytes !== command.s) {
            this.#destroyOnPeerError(
              "bytes-length-mismatch",
              "Peer response bytes length mismatch",
            );
          }
        }
        break;

      case PeerCommandType.SegmentDataSendingCompleted: {
        const downloadingContext = this.#downloadingContext;

        if (!downloadingContext?.isSegmentDataCommandReceived) return;

        const { request, controls, requestId } = downloadingContext;

        const isWrongSegment =
          request.segment.externalId !== command.i || requestId !== command.r;

        if (isWrongSegment) {
          this.#destroyOnPeerError(
            "protocol-violation",
            "Peer protocol violation",
          );
          return;
        }

        const isWrongBytes = request.loadedBytes !== request.totalBytes;

        if (isWrongBytes) {
          this.#destroyOnPeerError(
            "bytes-length-mismatch",
            "Peer response bytes length mismatch",
          );
          return;
        }

        const isValid = await request.validateData(
          this.#peerConfig.validateP2PSegment,
        );

        if (this.#isDestroyed) return;
        if (this.#downloadingContext !== downloadingContext) return;

        if (!isValid) {
          this.#destroyOnPeerError(
            "validation-failed",
            "P2P segment validation failed",
          );
          return;
        }

        this.#consecutiveTimeouts = 0;
        controls.completeOnSuccess();
        this.#bandwidthCalculator.stopLoading();
        this.#downloadingContext = undefined;
        break;
      }

      case PeerCommandType.SegmentAbsent:
        this.#loadedSegments.delete(command.i);
        if (
          this.#downloadingContext?.request.segment.externalId === command.i &&
          this.#downloadingContext.requestId === command.r
        ) {
          this.#cancelSegmentDownloading("peer-segment-absent");
        }
        break;

      case PeerCommandType.CancelSegmentRequest: {
        if (this.#latestRequestedUploadRequestId === command.r) {
          this.#latestRequestedUploadRequestId = undefined;
        }
        const uploadingRequestId = this.#peerProtocol.getUploadingRequestId();

        if (uploadingRequestId !== command.r) break;

        this.#peerProtocol.stopUploadingSegmentData();
        break;
      }
    }
  };

  #onSegmentChunkReceived = (chunk: Uint8Array) => {
    if (!this.#downloadingContext?.isSegmentDataCommandReceived) return;

    const { request, controls } = this.#downloadingContext;

    const isOverflow =
      request.totalBytes !== undefined &&
      request.loadedBytes + chunk.byteLength > request.totalBytes;

    if (isOverflow) {
      this.#destroyOnPeerError(
        "bytes-length-mismatch",
        "Peer response bytes length mismatch",
      );
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
        onAbort: () => void 0,
      },
      this.#peerConfig.validateP2PSegment,
      "p2p-segment-validation-failed",
    );

    if (completed) return;

    this.#bandwidthCalculator.startLoading();
    this.#nextRequestId = (this.#nextRequestId + 1) % 1000000000;
    this.#downloadingContext = {
      request: segmentRequest,
      requestId: this.#nextRequestId,
      isSegmentDataCommandReceived: false,
      controls: segmentRequest.start(
        { downloadSource: "p2p", peerId: this.id },
        {
          notReceivingBytesTimeoutMs:
            this.#peerConfig.p2pNotReceivingBytesTimeoutMs,
          onAbort: (error) => {
            // Note: This callback is exclusively triggered by Engine-initiated
            // cancellations (e.g., user seeks) or timeouts. It is mutually exclusive
            // from peer-initiated failures, which are handled by #cancelSegmentDownloading.
            if (
              !this.#downloadingContext ||
              this.#downloadingContext.request !== segmentRequest
            ) {
              return;
            }
            const { request, requestId } = this.#downloadingContext;
            this.#sendCancelSegmentRequestCommand(request.segment, requestId);
            this.#bandwidthCalculator.stopLoading();
            if (error.type !== "abort") {
              this.#bandwidthCalculator.clear();
              this.#cachedDownloadBandwidth.timestamp = 0;
              this.#logger(`cleared bandwidth history due to ${error.type}`);
            }
            this.#downloadingContext = undefined;

            if (error.type === "bytes-receiving-timeout") {
              this.#consecutiveTimeouts++;
            }

            if (this.#consecutiveTimeouts >= this.#peerConfig.p2pErrorRetries) {
              this.destroy(
                false,
                new PeerError("timeout", "Too many timeout errors"),
              );
            } else if (error.type === "bytes-receiving-timeout") {
              this.#eventHandlers.onWarning(
                new PeerWarning(
                  "timeout-strike",
                  `Timeout strike ${this.#consecutiveTimeouts}/${this.#peerConfig.p2pErrorRetries}`,
                ),
              );
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
    if (!this.#sendCommand(command)) {
      this.#cancelSegmentDownloading("peer-closed");
    }
  }

  async uploadSegmentData(
    segment: SegmentWithStream,
    requestId: number,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments
    data: ArrayBuffer | ArrayBufferView<ArrayBuffer>,
  ) {
    if (this.#isDestroyed) return;

    if (requestId !== this.#latestRequestedUploadRequestId) {
      this.#logger(
        `discarding obsolete upload request ${requestId} for segment ${segment.externalId}`,
      );
      return;
    }

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
    if (!this.#sendCommand(command)) return;
    try {
      await this.#peerProtocol.splitSegmentDataToChunksAndUploadAsync(
        data,
        requestId,
      );
      if (
        this.isDestroyed ||
        requestId !== this.#latestRequestedUploadRequestId
      ) {
        return;
      }
      this.#sendSegmentDataSendingCompletedCommand(segment, requestId);
      this.#logger(`segment ${externalId} has been sent to ${this.id}`);
    } catch (error) {
      this.#logger(`cancel segment uploading ${externalId}: %O`, error);
    }
  }

  #destroyOnPeerError(type: PeerErrorType, message: string) {
    this.#downloadingContext?.request.clearLoadedBytes();
    const error = new PeerError(type, message);
    this.#cancelSegmentDownloading("peer-closed", error);
    this.destroy(false, error);
  }

  #cancelSegmentDownloading(type: PeerRequestErrorType, cause?: PeerError) {
    if (!this.#downloadingContext) return;
    const { request, controls } = this.#downloadingContext;
    const { segment } = request;
    this.#logger(`cancel segment request ${segment.externalId} (${type})`);
    const error = new RequestError(type, undefined, cause);

    // Note: failWithError DOES NOT trigger the onAbort callback above.
    // We must manually clean up the peer's downloading context and bandwidth state.
    controls.failWithError(error);
    this.#bandwidthCalculator.stopLoading();

    if (type !== "peer-segment-absent") {
      this.#bandwidthCalculator.clear();
      this.#cachedDownloadBandwidth.timestamp = 0;
      this.#logger(`cleared bandwidth history due to ${error.type}`);
    }

    this.#downloadingContext = undefined;
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
    void this.#sendCommand(command);
  }

  sendSegmentAbsentCommand(segmentExternalId: number, requestId: number) {
    void this.#sendCommand({
      c: PeerCommandType.SegmentAbsent,
      i: segmentExternalId,
      r: requestId,
    });
  }

  #sendCancelSegmentRequestCommand(
    segment: SegmentWithStream,
    requestId: number,
  ) {
    void this.#sendCommand({
      c: PeerCommandType.CancelSegmentRequest,
      i: segment.externalId,
      r: requestId,
    });
  }

  #sendSegmentDataSendingCompletedCommand(
    segment: SegmentWithStream,
    requestId: number,
  ) {
    void this.#sendCommand({
      c: PeerCommandType.SegmentDataSendingCompleted,
      r: requestId,
      i: segment.externalId,
    });
  }

  destroy(isConnectionClosed = false, error?: PeerError) {
    if (this.#isDestroyed) return;
    this.#isDestroyed = true;

    this.#cancelSegmentDownloading("peer-closed", error);
    this.#peerProtocol.destroy();

    if (!isConnectionClosed) {
      this.#closeConnection(error);
    }
    this.#logger(`peer closed ${this.id}`);
  }

  #sendCommand(command: Command.PeerCommand): boolean {
    if (this.#isDestroyed) return false;
    try {
      this.#peerProtocol.sendCommand(command);
      return true;
    } catch (error) {
      this.#logger("error sending command %d: %O", command.c, error);
      return false;
    }
  }
}
