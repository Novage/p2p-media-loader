import { PeerConnection } from "bittorrent-tracker";
import { PeerCommandType } from "./command";
import { P2PRequest } from "../request-container";
import { Segment, Settings } from "../types";
import * as Command from "./command";
import * as Utils from "../utils/utils";
import debug from "debug";

export class PeerRequestError extends Error {
  constructor(
    readonly type:
      | "abort"
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
  onSegmentRequested: (peer: Peer, segmentId: number) => void;
};

type PeerRequest = {
  segment: Segment;
  p2pRequest: P2PRequest;
  resolve: (data: ArrayBuffer) => void;
  reject: (error: PeerRequestError) => void;
  chunks: ArrayBuffer[];
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
  private loadedSegments = new Set<number>();
  private httpLoadingSegments = new Set<number>();
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

      connection.on("data", (data) => {
        try {
          const command = Command.deserializeCommand(data);
          this.receiveCommand(command);
        } catch (err) {
          this.receiveSegmentChunk(data);
        }
      });
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
        this.eventHandlers.onSegmentRequested(this, command.i);
        break;

      case PeerCommandType.SegmentData:
        if (this.request?.segment.externalId === command.i) {
          const { progress } = this.request!.p2pRequest;
          progress.totalBytes = command.s;
          progress.canBeTracked = true;
        }
        break;

      case PeerCommandType.SegmentAbsent:
        if (this.request?.segment.externalId === command.i) {
          this.cancelSegmentRequest("segment-absent");
          this.loadedSegments.delete(command.i);
        }
        break;

      case PeerCommandType.CancelSegmentRequest:
        this.isUploadingSegment = false;
        break;
    }
  }

  private sendCommand(command: Command.PeerCommand) {
    if (!this.connection) return;
    let serializedCommand: Uint8Array | undefined;
    switch (command.c) {
      case PeerCommandType.SegmentRequest:
      case PeerCommandType.CancelSegmentRequest:
      case PeerCommandType.SegmentAbsent:
        serializedCommand = Command.serializePeerSegmentCommand(command);
        break;
      case PeerCommandType.SegmentsAnnouncement:
        serializedCommand =
          Command.serializeSegmentAnnouncementCommand(command);
        break;
      case PeerCommandType.SegmentData:
        this.connection.send(Command.serializePeerSendSegmentCommand(command));
        break;
    }
    if (serializedCommand) this.connection.send(serializedCommand);
  }

  requestSegment(segment: Segment) {
    if (this.request) {
      throw new Error("Segment already is downloading");
    }
    const { externalId } = segment;
    const command: Command.PeerSegmentCommand = {
      c: PeerCommandType.SegmentRequest,
      i: externalId,
    };
    this.sendCommand(command);
    this.request = this.createPeerRequest(segment);
    return this.request.p2pRequest;
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
    if (!this.connection) return;
    this.logger(`send segment ${segmentExternalId} to ${this.id}`);
    const command: Command.PeerSendSegmentCommand = {
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

  sendSegmentAbsent(segmentExternalId: number) {
    this.sendCommand({
      c: PeerCommandType.SegmentAbsent,
      i: segmentExternalId,
    });
  }

  private createPeerRequest(segment: Segment): PeerRequest {
    const { promise, resolve, reject } =
      Utils.getControlledPromise<ArrayBuffer>();
    return {
      segment,
      resolve,
      reject,
      responseTimeoutId: this.setRequestTimeout(),
      chunks: [],
      p2pRequest: {
        type: "p2p",
        progress: {
          canBeTracked: false,
          totalBytes: 0,
          loadedBytes: 0,
          percent: 0,
          startTimestamp: performance.now(),
        },
        promise,
        abort: () => this.cancelSegmentRequest("abort"),
      },
    };
  }

  private receiveSegmentChunk(chunk: ArrayBuffer): void {
    const { request } = this;
    const progress = request?.p2pRequest?.progress;
    if (!request || !progress) return;

    progress.loadedBytes += chunk.byteLength;
    progress.percent = (progress.loadedBytes / progress.loadedBytes) * 100;
    progress.lastLoadedChunkTimestamp = performance.now();
    request.chunks.push(chunk);

    if (progress.loadedBytes === progress.totalBytes) {
      const segmentData = joinChunks(request.chunks);
      const { lastLoadedChunkTimestamp, startTimestamp, loadedBytes } =
        progress;
      const loadingDuration = lastLoadedChunkTimestamp - startTimestamp;
      this.bandwidthMeasurer.addMeasurement(loadedBytes, loadingDuration);
      this.approveRequest(segmentData);
    } else if (progress.loadedBytes > progress.totalBytes) {
      this.cancelSegmentRequest("response-bytes-mismatch");
    }
  }

  private approveRequest(data: ArrayBuffer) {
    this.request?.resolve(data);
    this.clearRequest();
  }

  private cancelSegmentRequest(type: PeerRequestError["type"]) {
    if (!this.request) return;
    this.logger(
      `cancel segment request ${this.request?.segment.externalId} (${type})`
    );
    const error = new PeerRequestError(type);
    const sendCancelCommandTypes: PeerRequestError["type"][] = [
      "destroy",
      "abort",
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

function joinChunks(chunks: ArrayBuffer[]): ArrayBuffer {
  const bytesSum = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const buffer = new Uint8Array(bytesSum);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }

  return buffer;
}

function hexToUtf8(hexString: string) {
  const bytes = new Uint8Array(hexString.length / 2);

  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.slice(i, i + 2), 16);
  }
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}
