import { PeerConnection } from "bittorrent-tracker";
import {
  JsonSegmentAnnouncement,
  PeerCommand,
  PeerSegmentAnnouncementCommand,
  PeerSegmentCommand,
  PeerSendSegmentCommand,
} from "../internal-types";
import { PeerCommandType, PeerSegmentStatus } from "../enums";
import * as PeerUtil from "../utils/peer";
import { Request, RequestControls } from "../request";
import { Segment, Settings } from "../types";
import * as Utils from "../utils/utils";
import debug from "debug";

export class PeerRequestError extends Error {
  constructor(
    readonly type:
      | "manual-abort"
      | "request-timeout"
      | "response-bytes-mismatch"
      | "segment-absent"
      | "peer-closed"
      | "destroy"
  ) {
    super();
  }
}

type PeerEventHandlers = {
  onPeerClosed: (peer: Peer) => void;
  onSegmentRequested: (peer: Peer, segmentId: string) => void;
};

type PeerSettings = Pick<
  Settings,
  "p2pSegmentDownloadTimeout" | "webRtcMaxMessageSize"
>;

export class Peer {
  readonly id: string;
  private segments = new Map<string, PeerSegmentStatus>();
  private requestData?: { request: Request; controls: RequestControls };
  private readonly logger = debug("core:peer");
  private readonly bandwidthMeasurer = new BandwidthMeasurer();
  private isUploadingSegment = false;

  constructor(
    private readonly connection: PeerConnection,
    private readonly eventHandlers: PeerEventHandlers,
    private readonly settings: PeerSettings
  ) {
    this.id = hexToUtf8(connection.id);
    this.eventHandlers = eventHandlers;

    connection.on("data", this.onReceiveData.bind(this));
    connection.on("close", () => {
      this.cancelSegmentRequest("peer-closed");
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
    return this.requestData?.request.segment;
  }

  get bandwidth(): number | undefined {
    return this.bandwidthMeasurer.getBandwidth();
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
        if (this.requestData?.request.segment.externalId === command.i) {
          this.requestData.request.setTotalBytes(command.s);
        }
        break;

      case PeerCommandType.SegmentAbsent:
        if (this.requestData?.request.segment.externalId === command.i) {
          this.cancelSegmentRequest("segment-absent");
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
    if (this.requestData) {
      throw new Error("Segment already is downloading");
    }
    this.requestData = {
      request,
      controls: request.start("p2p", () =>
        this.cancelSegmentRequest("manual-abort")
      ),
    };
    const command: PeerSegmentCommand = {
      c: PeerCommandType.SegmentRequest,
      i: request.segment.externalId,
    };
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
    if (!this.requestData) return;
    const { request, controls } = this.requestData;
    controls.addLoadedChunk(chunk);

    if (request.loadedBytes === request.totalBytes) {
      controls.completeOnSuccess();
      this.clearRequest();
    } else if (
      request.totalBytes !== undefined &&
      request.loadedBytes > request.totalBytes
    ) {
      this.cancelSegmentRequest("response-bytes-mismatch");
    }
  }

  private cancelSegmentRequest(type: PeerRequestError["type"]) {
    if (!this.requestData) return;
    const { request, controls } = this.requestData;
    const { segment } = request;
    this.logger(`cancel segment request ${segment.externalId} (${type})`);
    const error = new PeerRequestError(type);
    const sendCancelCommandTypes: PeerRequestError["type"][] = [
      "destroy",
      "manual-abort",
      "request-timeout",
      "response-bytes-mismatch",
    ];
    if (sendCancelCommandTypes.includes(type)) {
      this.sendCommand({
        c: PeerCommandType.CancelSegmentRequest,
        i: segment.externalId,
      });
    }
    controls.cancelOnError(error);
    this.clearRequest();
  }

  private setRequestTimeout(): number {
    return window.setTimeout(
      () => this.cancelSegmentRequest("request-timeout"),
      this.settings.p2pSegmentDownloadTimeout
    );
  }

  private clearRequest() {
    clearTimeout(this.request?.responseTimeoutId);
    this.request = undefined;
  }

  destroy() {
    this.cancelSegmentRequest("destroy");
    this.connection.destroy();
  }

  static getPeerIdFromHexString(hex: string) {
    return hexToUtf8(hex);
  }
}

const SMOOTHING_COEF = 0.5;

class BandwidthMeasurer {
  private bandwidth?: number;

  addMeasurement(bytes: number, loadingDurationMs: number) {
    const bits = bytes * 8;
    const currentBandwidth = (bits * 1000) / loadingDurationMs;

    this.bandwidth =
      this.bandwidth !== undefined
        ? currentBandwidth * SMOOTHING_COEF +
          (1 - SMOOTHING_COEF) * this.bandwidth
        : currentBandwidth;
  }

  getBandwidth() {
    return this.bandwidth;
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
