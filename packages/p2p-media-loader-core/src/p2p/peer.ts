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
import { P2PRequest } from "../request-container";
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
  onPeerConnected: (peer: Peer) => void;
  onPeerClosed: (peer: Peer) => void;
  onSegmentRequested: (peer: Peer, segmentId: string) => void;
};

type PeerRequest = {
  segment: Segment;
  p2pRequest: P2PRequest;
  resolve: (data: ArrayBuffer) => void;
  reject: (error: PeerRequestError) => void;
  responseTimeoutId: number;
};

type PeerSettings = Pick<
  Settings,
  "p2pSegmentDownloadTimeout" | "webRtcMaxMessageSize"
>;

export class Peer {
  readonly id: string;
  private connection?: PeerConnection;
  private connections = new Set<PeerConnection>();
  private segments = new Map<string, PeerSegmentStatus>();
  private request?: PeerRequest;
  private readonly logger = debug("core:peer");
  private readonly bandwidthMeasurer = new BandwidthMeasurer();
  private isUploadingSegment = false;

  constructor(
    connection: PeerConnection,
    private readonly eventHandlers: PeerEventHandlers,
    private readonly settings: PeerSettings
  ) {
    this.id = hexToUtf8(connection.id);
    this.eventHandlers = eventHandlers;
    this.addConnection(connection);
  }

  addConnection(connection: PeerConnection) {
    if (this.connection && connection !== this.connection) {
      connection.destroy();
      return;
    }
    this.connections.add(connection);

    connection.on("connect", () => {
      if (this.connection) return;

      this.connection = connection;
      for (const item of this.connections) {
        if (item !== connection) {
          this.connections.delete(item);
          item.destroy();
        }
      }
      this.eventHandlers.onPeerConnected(this);
      this.logger(`connected with peer: ${this.id}`);

      connection.on("data", this.onReceiveData.bind(this));
      connection.on("close", () => {
        this.connection = undefined;
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
    });
  }

  get isConnected() {
    return !!this.connection;
  }

  get downloadingSegment(): Segment | undefined {
    return this.request?.segment;
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
        if (this.request?.segment.externalId === command.i) {
          const { progress } = this.request.p2pRequest;
          progress.totalBytes = command.s;
        }
        break;

      case PeerCommandType.SegmentAbsent:
        if (this.request?.segment.externalId === command.i) {
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
    if (!this.connection) return;
    this.connection.send(JSON.stringify(command));
  }

  requestSegment(segment: Segment) {
    if (this.request) {
      throw new Error("Segment already is downloading");
    }
    const { externalId } = segment;
    const command: PeerSegmentCommand = {
      c: PeerCommandType.SegmentRequest,
      i: externalId,
    };
    this.sendCommand(command);
    this.request = this.createPeerRequest(segment);
    return this.request.p2pRequest;
  }

  sendSegmentsAnnouncement(announcement: JsonSegmentAnnouncement) {
    const command: PeerSegmentAnnouncementCommand = {
      c: PeerCommandType.SegmentsAnnouncement,
      a: announcement,
    };
    this.sendCommand(command);
  }

  async sendSegmentData(segmentExternalId: string, data: ArrayBuffer) {
    if (!this.connection) return;
    this.logger(`send segment ${segmentExternalId} to ${this.id}`);
    const command: PeerSendSegmentCommand = {
      c: PeerCommandType.SegmentData,
      i: segmentExternalId,
      s: data.byteLength,
    };
    this.sendCommand(command);

    const chunks = getBufferChunks(data, this.settings.webRtcMaxMessageSize);
    const connection = this.connection;
    const channel = connection._channel;
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
        connection.send(chunk);
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

  private createPeerRequest(segment: Segment): PeerRequest {
    const { promise, resolve, reject } =
      Utils.getControlledPromise<ArrayBuffer>();
    return {
      segment,
      resolve,
      reject,
      responseTimeoutId: this.setRequestTimeout(),
      p2pRequest: {
        type: "p2p",
        progress: {
          loadedBytes: 0,
          startTimestamp: performance.now(),
          chunks: [],
        },
        promise,
        abort: () => this.cancelSegmentRequest("manual-abort"),
      },
    };
  }

  private receiveSegmentChunk(chunk: Uint8Array): void {
    const { request } = this;
    if (!request) return;

    const { progress } = request.p2pRequest;
    progress.loadedBytes += chunk.byteLength;
    progress.lastLoadedChunkTimestamp = performance.now();
    progress.chunks.push(chunk);

    if (progress.loadedBytes === progress.totalBytes) {
      const segmentData = Utils.joinChunks(
        progress.chunks,
        progress.totalBytes
      );
      const { lastLoadedChunkTimestamp, startTimestamp, loadedBytes } =
        progress;
      const loadingDuration = lastLoadedChunkTimestamp - startTimestamp;
      this.bandwidthMeasurer.addMeasurement(loadedBytes, loadingDuration);
      request.resolve(segmentData);
      this.clearRequest();
    } else if (
      progress.totalBytes !== undefined &&
      progress.loadedBytes > progress.totalBytes
    ) {
      this.cancelSegmentRequest("response-bytes-mismatch");
    }
  }

  private cancelSegmentRequest(type: PeerRequestError["type"]) {
    if (!this.request) return;
    this.logger(
      `cancel segment request ${this.request?.segment.externalId} (${type})`
    );
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
        i: this.request.segment.externalId,
      });
    }
    this.request.reject(error);
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
    this.connection?.destroy();
    this.connection = undefined;
    for (const connection of this.connections) {
      connection.destroy();
    }
    this.connections.clear();
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
