import { PeerCandidate } from "bittorrent-tracker";
import {
  JsonSegmentAnnouncement,
  PeerCommand,
  PeerSegmentAnnouncementCommand,
  PeerSegmentCommand,
  PeerSendSegmentCommand,
} from "./internal-types";
import { PeerCommandType, PeerSegmentStatus } from "./enums";
import * as PeerUtil from "./utils/peer-utils";
import { P2PRequest } from "./request";
import { Segment, Settings } from "./types";
import * as Utils from "./utils/utils";
import { PeerRequestError } from "./errors";

type PeerEventHandlers = {
  onPeerConnected: (peer: Peer) => void;
  onSegmentRequested: (peer: Peer, segmentId: string) => void;
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
  private readonly candidates = new Set<PeerCandidate>();
  private connection?: PeerCandidate;
  private segments = new Map<string, PeerSegmentStatus>();
  private request?: PeerRequest;
  private isSendingData = false;

  constructor(
    candidate: PeerCandidate,
    private readonly eventHandlers: PeerEventHandlers,
    private readonly settings: PeerSettings
  ) {
    this.id = candidate.id;
    this.eventHandlers = eventHandlers;
    this.addCandidate(candidate);
  }

  addCandidate(candidate: PeerCandidate) {
    candidate.on("connect", () => {
      console.log("\nconnected with peer", this.connection === candidate);
      this.connection = candidate;
      this.eventHandlers.onPeerConnected(this);
    });
    candidate.on("data", this.onReceiveData.bind(this));
    candidate.on("close", () => {
      if (this.connection === candidate) {
        this.connection = undefined;
        this.cancelSegmentRequest("peer-closed");
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    candidate.on("error", () => {});
    this.candidates.add(candidate);
  }

  get isConnected() {
    return !!this.connection;
  }

  get downloadingSegment(): Segment | undefined {
    return this.request?.segment;
  }

  getSegmentStatus(segment: Segment): PeerSegmentStatus | undefined {
    const { externalId } = segment;
    return this.segments.get(externalId);
  }

  private onReceiveData(data: ArrayBuffer) {
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
          this.request.p2pRequest.progress = {
            percent: 0,
            loadedBytes: 0,
            totalBytes: command.s,
          };
        }
        break;

      case PeerCommandType.SegmentAbsent:
        if (this.request?.segment.externalId === command.i) {
          this.cancelSegmentRequest("segment-absent");
          this.segments.delete(command.i);
        }
        break;

      case PeerCommandType.CancelSegmentRequest:
        this.stopSendSegmentData();
        break;
    }
  }

  private sendCommand(command: PeerCommand) {
    if (!this.connection) return;
    this.connection.write(JSON.stringify(command));
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

  sendSegmentData(segmentExternalId: string, data: ArrayBuffer) {
    if (!this.connection) return;
    const command: PeerSendSegmentCommand = {
      c: PeerCommandType.SegmentData,
      i: segmentExternalId,
      s: data.byteLength,
    };
    this.sendCommand(command);

    this.isSendingData = true;
    const sendChunk = async (data: ArrayBuffer) => this.connection?.write(data);
    for (const chunk of getBufferChunks(
      data,
      this.settings.webRtcMaxMessageSize
    )) {
      if (!this.isSendingData) break;
      void sendChunk(chunk);
    }
    this.isSendingData = false;
  }

  stopSendSegmentData() {
    this.isSendingData = false;
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
      chunks: [],
      p2pRequest: {
        type: "p2p",

        startTimestamp: performance.now(),
        promise,
        abort: () => this.cancelSegmentRequest("abort"),
      },
    };
  }

  private receiveSegmentChunk(chunk: ArrayBuffer): void {
    // TODO: check can be chunk received before peer command answer
    const { request } = this;
    const progress = request?.p2pRequest?.progress;
    if (!request || !progress) return;

    progress.loadedBytes += chunk.byteLength;
    progress.percent = (progress.loadedBytes / progress.loadedBytes) * 100;
    progress.lastLoadedChunkTimestamp = performance.now();
    request.chunks.push(chunk);

    if (progress.loadedBytes === progress.totalBytes) {
      const segmentData = joinChunks(request.chunks);
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
    const error = new PeerRequestError(type);
    if (!this.request) return;
    if (!["segment-absent", "peer-closed"].includes(type)) {
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
    this.candidates.clear();
  }
}

function* getBufferChunks(
  data: ArrayBuffer,
  maxChunkSize: number
): Generator<ArrayBuffer> {
  let bytesLeft = data.byteLength;
  while (bytesLeft > 0) {
    const bytesToSend = bytesLeft >= maxChunkSize ? maxChunkSize : bytesLeft;
    const buffer = Buffer.from(data, data.byteLength - bytesLeft, bytesToSend);
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
